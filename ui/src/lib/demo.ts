import { useEffect, useSyncExternalStore } from 'react';
import { api, ApiError, DEMO_DISABLED_MESSAGE } from './api';
import { clearDemoCode, useDemoCode } from './demoCode';
import { serverStatus } from './serverStatus';
import type { DemoStatus } from './types';

/**
 * Public-demo status (GET /v1/demo/status), shared by every screen. Fetched once on first use,
 * again when the server comes up (the first answer may have come from the static snapshot),
 * and on demand via refreshDemoStatus().
 */
interface DemoState {
  status: DemoStatus | null;
  /** True until the first answer (or failure). */
  pending: boolean;
}

let state: DemoState = { status: null, pending: true };
const listeners = new Set<() => void>();
let started = false;
let gen = 0;

function set(patch: Partial<DemoState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function refreshDemoStatus(): void {
  started = true;
  const g = ++gen;
  api.demoStatus().then(
    (status) => {
      if (g === gen) set({ status: { ...status, demo_mode: status?.demo_mode === true }, pending: false });
    },
    (e: unknown) => {
      // Older backend (404): a normal deployment. Unreachable: keep what we had (e.g. the snapshot).
      if (g !== gen) return;
      const notFound = e instanceof ApiError && e.status === 404;
      set({ status: notFound ? { demo_mode: false } : (state.status ?? { demo_mode: false }), pending: false });
    },
  );
}

/** The server said the daily cap is spent: flip to the limit state without waiting for a refetch. */
export function markLimitReached() {
  if (state.status) set({ status: { ...state.status, limit_reached: true } });
  // Ask again so we learn which cap (daily or total) was hit.
  refreshDemoStatus();
}

/** 'daily' unless the server says the lifetime budget is spent. */
export const limitReason = (s: DemoStatus | null | undefined): 'daily' | 'total' =>
  s?.limit_reason === 'total' ? 'total' : 'daily';

let lastPhase = serverStatus.getSnapshot().status;
serverStatus.subscribe(() => {
  const phase = serverStatus.getSnapshot().status;
  if (phase === 'up' && lastPhase !== 'up' && started) refreshDemoStatus();
  lastPhase = phase;
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const snapshot = () => state;

export function useDemoStatus(): DemoState {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!started) refreshDemoStatus();
  }, []);
  return s;
}

/** True when the backend runs as the public demo: paid/state-changing controls are disabled. */
export function useIsDemo(): boolean {
  return useDemoStatus().status?.demo_mode === true;
}

export type DemoAccess = 'pending' | 'open' | 'locked' | 'limit';

/** Whether the live chat screens may send messages. */
export function useDemoAccess(): { access: DemoAccess; status: DemoStatus | null } {
  const { status, pending } = useDemoStatus();
  const code = useDemoCode();
  const access: DemoAccess = pending
    ? 'pending'
    : !status?.demo_mode
      ? 'open'
      : status.limit_reached
        ? 'limit'
        : !code
          ? 'locked'
          : 'open';
  return { access, status };
}

/**
 * Turn a chat error into user-facing copy and apply its side effects (an invalid code is
 * forgotten so the gate shows again; a spent daily cap flips the page to the limit state).
 */
export function handleChatError(err: ApiError): ApiError {
  const demo = state.status?.demo_mode === true;
  const mk = (msg: string) => new ApiError(err.status, err.path, msg, err.detail);
  if (err.status === 401 && err.detail === 'invalid access code') {
    clearDemoCode();
    return mk('That access code is no longer valid. Enter it again to continue.');
  }
  if (err.status === 429 && err.detail === 'demo_daily_limit') {
    markLimitReached();
    return mk(
      limitReason(state.status) === 'total'
        ? "The demo's total budget has been used. Live chat is paused."
        : 'Demo limit reached for today. The daily spend cap resets at 00:00 UTC.',
    );
  }
  if (err.status === 429 && err.detail === 'ip_rate_limited') {
    const n = state.status?.ip_limit_per_hour;
    return mk(`You've reached the demo limit of ${n ?? 'N'} messages per hour. Try again later.`);
  }
  if (err.status === 503 && (demo || /demo/i.test(err.detail ?? ''))) {
    return mk('Demo chat is not configured.');
  }
  return err;
}

/** Props for a control that the public demo disables (paired with <DemoLock> for the tooltip). */
export const demoDisabledProps = (active: boolean) =>
  active ? { disabled: true, 'aria-description': DEMO_DISABLED_MESSAGE, title: DEMO_DISABLED_MESSAGE } : {};
