# Support Copilot UI

Demo front end for the Urbane Threads Support Copilot. Built with React 18, Vite, TypeScript (strict), Tailwind v3, Framer Motion, Recharts and lucide-react.

| Route       | Screen                                                                   |
| ----------- | ------------------------------------------------------------------------ |
| `/`         | Support Chat: streaming replies with intent, policy, confidence, escalation and feedback |
| `/compare`  | Base vs Aligned: two parallel streams, a word-level LCS diff and a heuristic field table |
| `/pipeline` | Alignment Pipeline: Upload → Benchmark → Align → Poll → Deploy timeline, runs and spend |
| `/eval`     | Eval Dashboard: score cards, charts and a filterable question table       |
| `/feedback` | Feedback Loop: flags, corrections, the re-align dataset and a before/after eval comparison |

Every number on screen comes from the API. When an endpoint is down, returns 404 or has no data, the page shows a designed error or empty state with a retry button. It never shows placeholder data.

## Run

```bash
cd ui
npm install
npm run dev          # http://localhost:5173 ; /api/* is proxied to http://localhost:8000
```

Start the backend separately (`uv run uvicorn --factory app.api.main:create_app --port 8000` from the repo root).

```bash
npm run build        # tsc -b (strict) + vite build -> dist/
npm run preview      # serve dist/ on :5173 (same /api proxy)
npm run lint         # eslint flat config + typescript-eslint
npm run contrast     # WCAG AA check of design-token pairs (both themes)
```

## Environment

| Variable           | Default             | Purpose                                                    |
| ------------------ | ------------------- | ---------------------------------------------------------- |
| `VITE_API_BASE`    | `/api`              | API base URL. `/api` goes through the dev/nginx proxy. On Vercel: the full Render URL. |
| `VITE_API_KEY`     | empty (`dev-key-change-me` in `npm run dev` via `.env.development`) | Sent as `X-API-Key` only when non-empty. Never set for a public build. |
| `ALLOW_API_KEY_IN_BUNDLE` | unset        | Set to `1` to allow a build that embeds `VITE_API_KEY` (the private Docker image does). |
| `API_PROXY_TARGET` | `http://localhost:8000` | Where the dev server sends `/api` requests (dev only). |
| `UI_URL`           | `http://localhost:5173` | Base URL that Playwright tests run against.            |

`VITE_*` values are compiled into the bundle and readable by anyone. `.env.development` (committed, non-secret) gives `npm run dev` the local key so it keeps working against a non-demo backend; Vite does not load it for `npm run build`. If a production build still sees a `VITE_API_KEY` (from `.env.local`, CI or Vercel env), `vite.config.ts` fails the build unless `ALLOW_API_KEY_IN_BUNDLE=1`. Note that `npm run preview` serves a keyless build, so against a non-demo backend use `npm run dev`.

## Public demo (Vercel + Render)

The public deployment is this UI on Vercel talking cross-origin to the FastAPI backend on Render (free tier, sleeps when idle) running with demo mode on.

**Vercel setup.** Import the repo with root directory `ui/`. `vercel.json` sets the Vite build (`npm run build` → `dist`), rewrites every non-asset route to `/index.html` for the SPA, caches `/assets/*` for a year (`immutable`, hashed file names) and serves `/index.html`, SPA routes and `/demo-snapshot.json` with `no-cache, must-revalidate`. Set exactly one environment variable:

```
VITE_API_BASE=https://<your-render-service>.onrender.com
```

No API key. The backend must list the Vercel domain in its CORS origins.

**Demo mode** (`GET /v1/demo/status` → `demo_mode: true`):

- Read screens (Pipeline, Eval, Feedback) are public and need no headers.
- Chat and Compare sit behind an access-code gate. `Unlock` calls `POST /v1/demo/verify`; on success the code is stored in `localStorage` (`ut-demo-code`) and sent as `X-Demo-Code` on `/v1/support/query` and `/v1/support/stream` only. The gate also shows today's budget (`spent_today_usd` of `daily_cap_usd`).
- Chat errors arrive as plain HTTP errors before any SSE event; `src/lib/sse.ts` surfaces status + detail and `handleChatError` (`src/lib/demo.ts`) maps them: 401 `invalid access code` forgets the code and shows the gate again; 429 `demo_daily_limit` switches to the limit state; 429 `ip_rate_limited` shows "You've reached the demo limit of N messages per hour"; 503 shows "Demo chat is not configured".
- `limit_reached` shows a designed limit state and disables the composer: "Demo limit reached for today" (resets 00:00 UTC) for `limit_reason: "daily"` (or missing), or "The demo's total budget has been used" for `"total"`.
- Paid or state-changing controls are disabled with the tooltip and `aria-description` "Disabled in the public demo": Pipeline Prepare / Start alignment / Deploy, Feedback Re-align, and the thumbs/correction controls on answer cards. A `403 disabled in demo` is still handled (toast). The header shows a "Public demo · read-only" pill.

**Wake-up screen.** `src/lib/serverStatus.ts` pings `${VITE_API_BASE}/health` on load with a 2 s timeout. If that fails the state becomes `waking` and `/health` is polled every 3 s (2.5 s timeout each, `setTimeout` chains only). Chat and Compare show a full-screen "Waking up the server… ☕" screen with an elapsed counter; after 90 s it adds "Still waking up, retrying…" and a Retry button. It cross-fades into the app once `/health` answers. Reduced motion swaps the pulse rings and sweeping bar for a static, elapsed-based bar.

**Static snapshot.** `public/demo-snapshot.json` (written by the backend repo) holds saved responses for the read endpoints, keyed by path without query string. While the server is not confirmed `up`, GET requests that have a snapshot entry are answered from it (`src/lib/snapshot.ts`), so Pipeline, Eval and Feedback render instantly with a slim "Live server waking up · showing saved snapshot from …" banner. `useResource` refetches everything when the server comes up, replacing the snapshot with live data. A missing or empty snapshot (`{"generated_at": null, "responses": {}}`) just means reads wait for the server.

**Eval runs.** The Eval Dashboard has a run selector fed by `/v1/eval/history` (default: latest; `?run=<id>` loads `/v1/eval/runs/<id>`). The selected run's label is shown verbatim under the page title, so entries such as "Exp 3 + JSON repair (offline re-score, not a new run)" stay clearly marked.

## Screenshots and e2e

```bash
npx playwright install chromium
npm run test:e2e                         # smoke tests + screenshots (starts a dev server if none is running)
UI_URL=http://localhost:4173 npm run screenshots
```

Specs that run without a backend (everything is mocked with `page.route`):

```bash
npx playwright test e2e/smoke.spec.ts e2e/wake.spec.ts e2e/demo.spec.ts
```

- `smoke.spec.ts` mocks `/health` so the live routes skip the wake screen, then checks every route heading.
- `wake.spec.ts` keeps `/health` failing, uses `page.clock` to jump past 90 s, then lets `/health` succeed and checks the app appears; it also checks the snapshot banner on `/eval` with a fixture snapshot. Writes `screenshots/wake-<theme>.png`, `wake-slow-<theme>.png` and `wake-snapshot-eval-dark.png`.
- `demo.spec.ts` covers the access gate, wrong/right/rejected codes, the per-IP message, daily and total limit states, disabled demo controls, the eval run selector and a non-demo backend. Writes `screenshots/demo-gate-dark.png` and `demo-limit-dark.png`.

`e2e/live.spec.ts` and `e2e/screenshots.spec.ts` need a running backend.

`e2e/screenshots.spec.ts` sets the theme through `localStorage` before the page loads. It captures all five screens in dark and light mode at 1440×900, plus the chat screen at 390×844, and writes them to `screenshots/<screen>-<theme>.png`. `e2e/smoke.spec.ts` checks that every route renders its heading and that the theme toggle persists.

## Docker

```bash
docker build -t support-copilot-ui --build-arg VITE_API_KEY=dev-key-change-me ui/   # private image: embeds the key on purpose
docker run -p 8080:8080 --network <compose-network> support-copilot-ui
```

The build has two stages: `node:20-alpine` builds the app and `nginx:alpine` serves it. nginx runs as the unprivileged `nginx` user on port 8080. `nginx.conf` falls back to `index.html` for SPA routes and proxies `/api/` to `http://api:8000/` with `proxy_buffering off` so SSE streams pass through unbuffered.

## Design system

- Design tokens live in `src/index.css` as RGB channel variables under `[data-theme='dark']` and `[data-theme='light']`. `tailwind.config.js` maps them to Tailwind colors (`bg-surface/60`, `text-ink-muted`, `text-accent-text`, …). The two themes are designed separately; one is not an inversion of the other.
- The theme toggle has three options (light, system, dark). The choice is saved to `localStorage` under `ut-theme`, and an inline script in `index.html` applies it before the first paint.
- `scripts/contrast.mjs` reads the token blocks, blends the translucent glass surfaces over the page background, and fails if any text pair is below 4.5:1 or any UI pair is below 3:1.
- Motion uses `MotionConfig reducedMotion="user"`. A CSS `prefers-reduced-motion` block also disables shimmer, caret and keyframe animations.

## Implementation notes

- Streaming uses `fetch` with a `ReadableStream` SSE parser (`src/lib/sse.ts`) instead of `EventSource`, because the stream needs a POST body and the `X-API-Key` header. `answer_delta` text is revealed by a requestAnimationFrame typewriter. Raw `token` events appear behind a "Raw model tokens" toggle.
- The pipeline timeline is built from `state` and `events` (`src/lib/pipeline.ts`). Stage durations come from `detail.seconds` when present and otherwise from event timestamps. The page polls every 5 s while any run is still in progress, and for 2 min after you trigger a job.
- The Base vs Aligned verdict is labelled **heuristic**. It scores a valid `UT-XXX-000` policy_ref, no fallback, and higher confidence. Ground-truth escalation checks run in the server-side eval.
