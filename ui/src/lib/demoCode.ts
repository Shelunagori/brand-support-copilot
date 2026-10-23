import { useSyncExternalStore } from 'react';

/** Demo access code, persisted per browser. Sent as X-Demo-Code on chat requests. */
const KEY = 'ut-demo-code';

function read(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

let code: string | null = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getDemoCode = (): string | null => code;

export function setDemoCode(v: string) {
  code = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable: keep it in memory for this tab */
  }
  emit();
}

export function clearDemoCode() {
  code = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useDemoCode(): string | null {
  return useSyncExternalStore(subscribe, getDemoCode, getDemoCode);
}
