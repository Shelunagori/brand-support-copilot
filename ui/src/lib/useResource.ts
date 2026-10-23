import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { useServerPhase } from './serverStatus';

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | undefined;
  /** True only until the first response (success or error). */
  loading: boolean;
  /** True while any request (incl. background polls) is in flight. */
  fetching: boolean;
  reload: () => void;
}

type Fetcher<T> = (opts: { signal: AbortSignal }) => Promise<T>;

/**
 * Fetch + optional polling. Keeps last good data during background refreshes;
 * `pollMs` may be a function of the latest data, returning null to stop.
 */
export function useResource<T>(fetcher: Fetcher<T>, pollMs?: number | ((data: T | undefined) => number | null)): Resource<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  const pollRef = useRef(pollMs);
  fetcherRef.current = fetcher;
  pollRef.current = pollMs;

  // Reads may have been answered from the static snapshot while the API slept:
  // refetch live data as soon as the server comes up.
  const phase = useServerPhase();
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === 'up' && lastPhase.current !== 'up') setTick((t) => t + 1);
    lastPhase.current = phase;
  }, [phase]);

  const reload = useCallback(() => {
    setLoading((l) => l || data === undefined);
    setTick((t) => t + 1);
  }, [data]);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    const run = async () => {
      setFetching(true);
      let latest: T | undefined;
      try {
        latest = await fetcherRef.current({ signal: ctrl.signal });
        if (!alive) return;
        setData(latest);
        setError(undefined);
      } catch (e) {
        if (!alive || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError(e instanceof ApiError ? e : new ApiError(0, '', e instanceof Error ? e.message : 'Unknown error'));
      } finally {
        if (alive) {
          setLoading(false);
          setFetching(false);
        }
      }
      const p = pollRef.current;
      const interval = typeof p === 'function' ? p(latest) : p;
      if (alive && interval) timer = setTimeout(run, interval);
    };
    void run();
    return () => {
      alive = false;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [tick]);

  return { data, error, loading, fetching, reload };
}
