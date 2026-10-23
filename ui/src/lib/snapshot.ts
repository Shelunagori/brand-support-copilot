import { useEffect, useSyncExternalStore } from 'react';
import { SNAPSHOT_URL } from './config';

/**
 * Saved copy of the read-only endpoints (public/demo-snapshot.json), written by the backend
 * repo. While the API is asleep, GET requests are answered from here so the read-only screens
 * render instantly; live data replaces it once the server is up.
 */
export interface DemoSnapshot {
  generated_at: string | null;
  source?: string;
  /** Keys are API paths without query strings, e.g. "/v1/eval/latest". */
  responses: Record<string, unknown>;
}

let promise: Promise<DemoSnapshot | null> | null = null;
let loaded: DemoSnapshot | null = null;
const listeners = new Set<() => void>();

function isSnapshot(v: unknown): v is DemoSnapshot {
  if (!v || typeof v !== 'object') return false;
  const r = (v as { responses?: unknown }).responses;
  return !!r && typeof r === 'object' && !Array.isArray(r);
}

/** Fetch the snapshot once; resolves to null if it is missing or malformed. */
export function loadSnapshot(): Promise<DemoSnapshot | null> {
  if (!promise) {
    promise = fetch(SNAPSHOT_URL, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => (isSnapshot(json) ? json : null))
      .catch(() => null)
      .then((snap) => {
        loaded = snap;
        listeners.forEach((l) => l());
        return snap;
      });
  }
  return promise;
}

export const stripQuery = (path: string) => path.split('?')[0] ?? path;

/** The saved response for `path` (query string ignored), or undefined when not in the snapshot. */
export async function getSnapshot(path: string): Promise<unknown> {
  const snap = await loadSnapshot();
  const key = stripQuery(path);
  if (!snap || !Object.prototype.hasOwnProperty.call(snap.responses, key)) return undefined;
  return snap.responses[key];
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The loaded snapshot (null until loaded, or when unavailable). Triggers the lazy load. */
export function useSnapshotInfo(): DemoSnapshot | null {
  const snap = useSyncExternalStore(
    subscribe,
    () => loaded,
    () => loaded,
  );
  useEffect(() => {
    void loadSnapshot();
  }, []);
  return snap;
}
