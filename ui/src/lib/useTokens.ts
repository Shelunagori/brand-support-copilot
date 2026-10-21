import { useMemo, useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}
const getTheme = () => document.documentElement.dataset.theme ?? 'dark';

/** Resolve CSS color tokens (rgb channel vars) to concrete colors for SVG/Recharts. */
export function useTokens<K extends string>(names: readonly K[]): Record<K, string> {
  const theme = useSyncExternalStore(subscribe, getTheme, getTheme);
  const key = names.join('|');
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {} as Record<K, string>;
    for (const n of key.split('|') as K[]) {
      const v = cs.getPropertyValue(`--${n}`).trim();
      out[n] = v ? `rgb(${v.split(/\s+/).join(',')})` : 'currentColor';
    }
    return out;
    // `theme` changes the computed values even though it isn't read directly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, theme]);
}
