import { useSyncExternalStore } from 'react';
import { API_BASE } from './config';

/**
 * Wake-up detection for a backend that sleeps when idle (Render free tier).
 *
 * checking → first /health ping (2 s timeout) is in flight; the app renders normally.
 * up       → the API answered.
 * waking   → the first ping failed or timed out; /health is polled every 3 s until it answers.
 *
 * Timers are plain setTimeout chains (no setInterval) so tests can drive them with a fake clock.
 */
export type ServerPhase = 'checking' | 'up' | 'waking';

export interface ServerState {
  status: ServerPhase;
  /** When the current wait started (app load, or the last retry). */
  startedAt: number | null;
  /** ms since `startedAt`; refreshed every second while waking. */
  elapsedMs: number;
  /** True after 90 s of waking. Polling continues. */
  slow: boolean;
}

const FIRST_TIMEOUT_MS = 2000;
const POLL_EVERY_MS = 3000;
const POLL_TIMEOUT_MS = 2500;
const SLOW_AFTER_MS = 90_000;

let state: ServerState = { status: 'checking', startedAt: null, elapsedMs: 0, slow: false };
const listeners = new Set<() => void>();
let started = false;
/** Bumped on every (re)start so stale timers and in-flight pings become no-ops. */
let gen = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let tickTimer: ReturnType<typeof setTimeout> | undefined;

function set(patch: Partial<ServerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

async function ping(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // No custom headers: keeps this a CORS "simple" request (no preflight).
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
    return body?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function clearTimers() {
  if (pollTimer) clearTimeout(pollTimer);
  if (tickTimer) clearTimeout(tickTimer);
  pollTimer = tickTimer = undefined;
}

function markUp() {
  clearTimers();
  set({ status: 'up', slow: false });
}

function tick(g: number) {
  tickTimer = setTimeout(() => {
    if (g !== gen || state.status !== 'waking') return;
    const elapsedMs = Date.now() - (state.startedAt ?? Date.now());
    set({ elapsedMs, slow: elapsedMs >= SLOW_AFTER_MS });
    tick(g);
  }, 1000);
}

function attempt(g: number) {
  const t0 = Date.now();
  void ping(POLL_TIMEOUT_MS).then((ok) => {
    if (g !== gen) return;
    if (ok) {
      markUp();
      return;
    }
    // Keep a ~3 s cadence between attempt starts, but never hammer.
    const wait = Math.max(500, POLL_EVERY_MS - (Date.now() - t0));
    pollTimer = setTimeout(() => {
      if (g === gen) attempt(g);
    }, wait);
  });
}

function beginWaking(g: number) {
  const elapsedMs = Date.now() - (state.startedAt ?? Date.now());
  set({ status: 'waking', elapsedMs, slow: elapsedMs >= SLOW_AFTER_MS });
  tick(g);
  pollTimer = setTimeout(() => {
    if (g === gen) attempt(g);
  }, POLL_EVERY_MS);
}

/** Start detection once (idempotent). Called from main.tsx before the first render. */
function start() {
  if (started) return;
  started = true;
  const g = ++gen;
  set({ status: 'checking', startedAt: Date.now(), elapsedMs: 0, slow: false });
  void ping(FIRST_TIMEOUT_MS).then((ok) => {
    if (g !== gen) return;
    if (ok) markUp();
    else beginWaking(g);
  });
}

/** Reset the timer and poll immediately. No-op once the server is up. */
function retry() {
  if (state.status === 'up') return;
  clearTimers();
  const g = ++gen;
  set({ status: 'waking', startedAt: Date.now(), elapsedMs: 0, slow: false });
  tick(g);
  attempt(g);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getSnapshot = (): ServerState => state;

export const serverStatus = { start, retry, subscribe, getSnapshot };

export function useServerStatus(): ServerState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Just the phase, so consumers only re-render on phase changes (not every elapsed tick). */
export function useServerPhase(): ServerPhase {
  return useSyncExternalStore(
    subscribe,
    () => state.status,
    () => state.status,
  );
}
