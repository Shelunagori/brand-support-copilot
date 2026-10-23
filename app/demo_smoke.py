"""Smoke-test the deployed public demo (no paid calls unless --chat).

    python -m app.demo_smoke --api https://<render>.onrender.com --ui https://<vercel>.vercel.app
    python -m app.demo_smoke ... --code <access code> [--chat]   # --chat sends 1 real message
"""

import json
import os
import time
from collections.abc import Callable

import httpx
import typer

cli = typer.Typer(add_completion=False)
EVIL_ORIGIN = "https://not-allowed.example"


def wait_for_health(c: httpx.Client, api: str, max_s: float = 120) -> float:
    """Render free tier sleeps; the first request can take ~1 min."""
    started = time.monotonic()
    while True:
        try:
            if c.get(f"{api}/health", timeout=15).status_code == 200:
                return time.monotonic() - started
        except httpx.HTTPError:
            pass
        if time.monotonic() - started > max_s:
            raise typer.Exit(1)
        time.sleep(3)


@cli.command()
def main(api: str = typer.Option(..., help="Render API base URL"),
         ui: str = typer.Option(..., help="Vercel UI URL"),
         code: str = typer.Option("", help="Demo access code (or DEMO_ACCESS_CODE env)"),
         chat: bool = typer.Option(False, "--chat", help="Send ONE real chat message (paid)"),
         compare: bool = typer.Option(False, "--compare",
                                      help="One Compare call: base + aligned (2 paid messages)"),
         ) -> None:
    api, ui = api.rstrip("/"), ui.rstrip("/")
    code = code or os.environ.get("DEMO_ACCESS_CODE", "")
    results: list[tuple[str, bool, str]] = []

    def check(name: str, fn: Callable[[], tuple[bool, str]]) -> None:
        try:
            ok, detail = fn()
        except Exception as exc:  # report and keep going
            ok, detail = False, f"{type(exc).__name__}: {exc}"[:200]
        results.append((name, ok, detail))
        typer.echo(f"{'PASS' if ok else 'FAIL'}  {name:<46} {detail}")

    with httpx.Client(timeout=30, follow_redirects=True) as c:
        woke = wait_for_health(c, api)
        typer.echo(f"api awake after {woke:.0f}s")

        def ready() -> tuple[bool, str]:
            r = c.get(f"{api}/ready")
            return r.status_code == 200, json.dumps(r.json().get("checks"))

        def status() -> tuple[bool, str]:
            s = c.get(f"{api}/v1/demo/status").json()
            if s.get("demo_mode") is not True:
                return False, "DEMO_MODE is not true on the API (check the Render env vars)"
            return s.get("demo_mode") is True, f"cap ${s.get('daily_cap_usd')}, spent " \
                f"${s.get('spent_today_usd')}, ip limit {s.get('ip_limit_per_hour')}/h"

        def public_reads() -> tuple[bool, str]:
            runs = c.get(f"{api}/v1/pipeline/runs").json()
            hist = c.get(f"{api}/v1/eval/history").json()
            stats = c.get(f"{api}/v1/feedback/stats").json()
            ok = len(runs) >= 3 and len(hist) >= 4 and stats.get("thumbs_down", 0) > 0
            return ok, f"{len(runs)} runs, {len(hist)} evals, {stats.get('thumbs_down')} 👎"

        def models() -> tuple[bool, str]:
            m = c.get(f"{api}/v1/models").json()
            live = m.get("aligned_available") is True
            consistent = bool(m.get("aligned_model_id")) == live and bool(m.get("base_model_id"))
            state = f"aligned LIVE ({m.get('aligned_model_id')})" if live else "aligned offline"
            return consistent, f"{state}, base={m.get('base_model_id')}"

        def admin_disabled() -> tuple[bool, str]:
            codes = [c.post(f"{api}{p}", json=b).status_code for p, b in [
                ("/v1/pipeline/align", {"confirm": False}), ("/v1/pipeline/deploy", {}),
                ("/v1/realign", {"confirm": False}),
                ("/v1/feedback", {"inference_id": "x", "rating": "up"})]]
            return codes == [403] * 4, str(codes)

        def chat_needs_code() -> tuple[bool, str]:
            r = c.post(f"{api}/v1/support/query", json={"query": "hi"})
            return r.status_code == 401, f"{r.status_code} {r.json().get('detail')}"

        def cors_allows_ui() -> tuple[bool, str]:
            h = {"Origin": ui, "Access-Control-Request-Method": "POST",
                 "Access-Control-Request-Headers": "content-type,x-demo-code"}
            r = c.options(f"{api}/v1/support/query", headers=h)
            got = r.headers.get("access-control-allow-origin")
            return got == ui, f"allow-origin={got}"

        def cors_blocks_others() -> tuple[bool, str]:
            h = {"Origin": EVIL_ORIGIN, "Access-Control-Request-Method": "POST"}
            got = c.options(f"{api}/v1/support/query",
                            headers=h).headers.get("access-control-allow-origin")
            return got is None, f"allow-origin={got}"

        def ui_loads() -> tuple[bool, str]:
            r = c.get(ui)
            snap = c.get(f"{ui}/demo-snapshot.json")
            n = len(snap.json().get("responses", {})) if snap.status_code == 200 else 0
            no_key = "dev-key-change-me" not in r.text
            return r.status_code == 200 and n >= 9 and no_key, \
                f"index {r.status_code}, snapshot {n} endpoints, no key in html={no_key}"

        def ui_spa_route() -> tuple[bool, str]:
            r = c.get(f"{ui}/eval")
            return r.status_code == 200 and 'id="root"' in r.text, str(r.status_code)

        for name, fn in [("ready (Neon + Upstash)", ready), ("demo status", status),
                         ("public read endpoints (real data)", public_reads),
                         ("model availability is consistent", models),
                         ("paid/admin endpoints -> 403", admin_disabled),
                         ("chat requires access code", chat_needs_code),
                         ("CORS allows the Vercel origin", cors_allows_ui),
                         ("CORS rejects other origins", cors_blocks_others),
                         ("UI + snapshot served, no API key", ui_loads),
                         ("UI SPA deep link /eval", ui_spa_route)]:
            check(name, fn)

        if code:
            check("access code verifies", lambda: (
                c.post(f"{api}/v1/demo/verify", json={"code": code}).status_code == 200, ""))
        if code and chat:
            def one_message() -> tuple[bool, str]:
                r = c.post(f"{api}/v1/support/query", headers={"X-Demo-Code": code},
                           json={"query": "Can I return unworn jeans delivered 3 days ago?"},
                           timeout=120)
                b = r.json()
                return r.status_code == 200 and not b.get("fallback"), \
                    f"{b.get('model_id')} notice={b.get('notice')} {b.get('latency_ms')}ms"
            check("one live chat message (paid, ~$0.02)", one_message)

        if code and compare:
            q = "My jeans were delivered 3 days ago, unworn with tags. Can I return them?"
            before = c.get(f"{api}/v1/demo/status").json().get("spent_today_usd", 0.0)
            answers = {}
            for kind in ("base", "aligned"):
                r = c.post(f"{api}/v1/support/query", headers={"X-Demo-Code": code},
                           json={"query": q, "model": kind, "use_cache": False}, timeout=180)
                answers[kind] = (r.status_code, r.json())
            after = c.get(f"{api}/v1/demo/status").json().get("spent_today_usd", 0.0)
            for kind, (st, b) in answers.items():
                ok = st == 200 and b.get("model_kind") == kind and not b.get("fallback")
                results.append((f"compare: {kind}", ok, ""))
                typer.echo(f"{'PASS' if ok else 'FAIL'}  compare: {kind:<38} "
                           f"model={b.get('model_id')} "
                           f"json_first_try={b.get('json_valid_first_try')} "
                           f"repaired={b.get('repaired')} policy_ref={b.get('policy_ref')} "
                           f"conf={b.get('confidence')}({b.get('confidence_source')}) "
                           f"{b.get('latency_ms')}ms {b.get('total_tokens')}tok")
                typer.echo(f"      answer: {str(b.get('answer'))[:220]}")
            typer.echo(f"compare cost (demo budget, Nugen rate card): ${after - before:.4f}")

    failed = [n for n, ok, _ in results if not ok]
    typer.echo(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        raise typer.Exit(1)


if __name__ == "__main__":
    cli()
