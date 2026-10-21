export const POLICY_REF_RE = /^UT-[A-Z]{3}-\d{3}$/;

export const pct = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(digits)}%`;

export const ms = (v: number | null | undefined) => {
  if (v == null || Number.isNaN(v)) return '—';
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v).toLocaleString()} ms`;
};

export const usd = (v: number | null | undefined, digits = 4) =>
  v == null || Number.isNaN(v) ? '—' : `$${v.toFixed(v >= 1 ? 2 : digits)}`;

export const int = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString());

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.round((now - t) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const humanize = (s: string) => s.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function confidenceLevel(v: number): 'high' | 'mid' | 'low' {
  if (v >= 0.75) return 'high';
  if (v >= 0.5) return 'mid';
  return 'low';
}
