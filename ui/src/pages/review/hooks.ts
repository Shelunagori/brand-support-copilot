import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SNAPSHOT_URL } from '../../lib/config';
import { getSnapshot } from '../../lib/snapshot';

export type NavItem = { readonly id: string; readonly label: string };

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Scroll-spy: the active section is the first one (in page order) whose box crosses a band
 * just under the sticky bars. Falls back to the last section at the bottom of the page.
 */
export function useScrollSpy(ids: readonly string[]) {
  const [active, setActive] = useState<string>(ids[0] ?? '');
  const visible = useRef(new Set<string>());

  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const pick = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && ids.length) return setActive(ids[ids.length - 1]!);
      const first = ids.find((id) => visible.current.has(id));
      if (first) setActive(first);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.current.add(e.target.id);
          else visible.current.delete(e.target.id);
        }
        pick();
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    window.addEventListener('scroll', pick, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', pick);
    };
  }, [ids]);

  return [active, setActive] as const;
}

export function scrollToSection(id: string, smooth = true) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: smooth && !reducedMotion() ? 'smooth' : 'auto', block: 'start' });
  return true;
}

/**
 * Deep links (/review#cost): scroll once the page has mounted, and keep the target pinned while
 * content above it settles (the results table loads from the snapshot). Stops on user input.
 */
export function useHashScroll(ids: readonly string[]) {
  const { hash } = useLocation();
  const initial = useRef(hash.replace(/^#/, ''));

  useEffect(() => {
    const id = initial.current;
    if (!id || !ids.includes(id)) return;
    let done = false;
    const stop = () => {
      done = true;
    };
    const go = () => {
      if (!done) scrollToSection(id, false);
    };
    const t0 = window.setTimeout(go, 30);
    const ro = new ResizeObserver(go);
    ro.observe(document.body);
    const t1 = window.setTimeout(stop, 2500);
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    events.forEach((ev) => window.addEventListener(ev, stop, { passive: true, once: true }));
    return () => {
      done = true;
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      ro.disconnect();
      events.forEach((ev) => window.removeEventListener(ev, stop));
    };
  }, [ids]);
}


/** One scroll-spy shared by the chip bar and the rail; clicks update the hash and smooth-scroll. */
export function useSectionNav(items: readonly NavItem[]) {
  const ids = useRef(items.map((i) => i.id)).current;
  const [active, setActive] = useScrollSpy(ids);
  const navigate = useNavigate();
  useHashScroll(ids);

  const onNavigate = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      setActive(id);
      navigate({ hash: id }, { replace: true });
      scrollToSection(id);
      document.getElementById(`${id}-title`)?.focus({ preventScroll: true });
    },
    [navigate, setActive],
  );
  return { active, onNavigate };
}


/** One /v1/eval/history entry as bundled in public/demo-snapshot.json. */
export interface Metrics {
  model_id: string;
  factual_accuracy: number;
  policy_violation_rate: number;
  escalation_accuracy: number;
  json_validity: number;
  policy_ref_accuracy: number;
  latency_p50_ms: number;
}
export interface HistoryEntry {
  id: string;
  label: string;
  generated_at: string;
  summary: { base?: Metrics; aligned?: Metrics };
  base_model_id?: string | null;
  rescored?: boolean;
}

const HISTORY_KEY = '/v1/eval/history';

function isEntry(v: unknown): v is HistoryEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Partial<HistoryEntry>;
  return typeof e.id === 'string' && !!e.summary && typeof e.summary === 'object';
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: HistoryEntry[] };

/** Read the history from the bundled snapshot only. Never calls the API. */
export function useEvalHistory() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    // First attempt shares the app-wide cached snapshot request; a retry fetches the file again.
    const load: Promise<unknown> =
      attempt === 0
        ? getSnapshot(HISTORY_KEY)
        : fetch(SNAPSHOT_URL, { cache: 'no-cache' })
            .then((r) => (r.ok ? (r.json() as Promise<{ responses?: Record<string, unknown> }>) : null))
            .then((j) => j?.responses?.[HISTORY_KEY]);
    load
      .then((raw) => {
        if (!alive) return;
        if (!Array.isArray(raw)) return setState({ status: 'error' });
        setState({ status: 'ready', entries: raw.filter(isEntry) });
      })
      .catch(() => alive && setState({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((a) => a + 1);
  }, []);
  return { state, retry };
}

