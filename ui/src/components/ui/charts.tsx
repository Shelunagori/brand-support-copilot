import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'framer-motion';
import { useTokens } from '../../lib/useTokens';

export interface SeriesRow {
  label: string;
  base: number | null;
  aligned: number | null;
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[];
}

function Tip({ active, payload, label, format }: TipProps & { format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass min-w-[10rem] px-3 py-2 text-xs shadow-lift" style={{ background: 'rgb(var(--surface) / 0.95)' }}>
      <p className="mb-1.5 font-medium text-ink">{label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-ink-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden />
            {p.name}
          </span>
          <span className="num font-medium text-ink">{typeof p.value === 'number' ? format(p.value) : '—'}</span>
        </div>
      ))}
    </div>
  );
}

function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 5 ? 5 : n <= 6 ? 6 : 10;
  return step * p;
}

/** Grouped bars, base vs aligned, one shared axis and unit. */
export function GroupedBars({
  data,
  format,
  axisFormat,
  labelFormat,
  height = 260,
  domain,
  ariaLabel,
  names = { base: 'Base', aligned: 'Aligned' },
}: {
  names?: { base: string; aligned: string };
  data: SeriesRow[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  /** Compact format for the direct labels above bars (defaults to `format`). */
  labelFormat?: (v: number) => string;
  height?: number;
  domain?: [number, number];
  ariaLabel: string;
}) {
  const t = useTokens(['series-base', 'series-aligned', 'line', 'ink-muted', 'ink-subtle', 'surface-3'] as const);
  const reduce = useReducedMotion();
  const dataMax = Math.max(0, ...data.flatMap((d) => [d.base ?? 0, d.aligned ?? 0]));
  const top = domain ? domain[1] : niceCeil(dataMax * 1.12);
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 26, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={t.line} strokeOpacity={0.6} strokeDasharray="3 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: t.line }} tick={{ fill: t['ink-muted'], fontSize: 12 }} interval={0} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: t['ink-subtle'], fontSize: 11 }}
            tickFormatter={(v: number) => (axisFormat ?? format)(v)}
            domain={[0, top]}
            ticks={[0, 1, 2, 3, 4, 5].map((i) => (top * i) / 5)}
            width={58}
          />
          <Tooltip
            cursor={{ fill: t['surface-3'], fillOpacity: 0.45, radius: 6 } as object}
            content={(p) => <Tip {...(p as unknown as TipProps)} format={format} />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            itemSorter={null}
            formatter={(v: string) => <span style={{ color: t['ink-muted'], fontSize: 12 }}>{v}</span>}
          />
          <Bar
            dataKey="base"
            name={names.base}
            fill={t['series-base']}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={!reduce}
            animationDuration={900}
          />
          <Bar
            dataKey="aligned"
            name={names.aligned}
            fill={t['series-aligned']}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={!reduce}
            animationDuration={900}
            animationBegin={120}
          >
            <LabelList
              dataKey="aligned"
              position="top"
              fill={t['ink-muted']}
              fontSize={11}
              formatter={(v: unknown) => (typeof v === 'number' ? (labelFormat ?? format)(v) : '')}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
