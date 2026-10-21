import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { ms, usd } from '../../lib/format';
import { fmtMetric, type MetricDef } from '../../lib/metrics';
import type { EvalMetrics } from '../../lib/types';
import { Card } from '../ui/primitives';
import { AnimatedNumber } from '../ui/widgets';

export function Delta({ def, from, to }: { def: MetricDef; from: number | undefined; to: number | undefined }) {
  if (from == null || to == null) return <span className="text-xs text-ink-subtle">—</span>;
  const d = to - from;
  const eps = def.kind === 'rate' ? 0.0005 : def.kind === 'ms' ? 0.5 : 0.00005;
  if (Math.abs(d) < eps)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-ink-subtle">
        <Minus className="h-3.5 w-3.5" aria-hidden />
        no change
      </span>
    );
  const good = def.better === 'higher' ? d > 0 : d < 0;
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
  const text =
    def.kind === 'rate'
      ? `${d > 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} pp`
      : def.kind === 'ms'
        ? `${d > 0 ? '+' : '−'}${ms(Math.abs(d))}`
        : `${d > 0 ? '+' : '−'}${usd(Math.abs(d))}`;
  return (
    <span
      className={clsx(
        'num inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium',
        good ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
      )}
      title={good ? 'Better' : 'Worse'}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {text}
      <span className="sr-only">{good ? '(better)' : '(worse)'}</span>
    </span>
  );
}

export function ScoreCard({
  def,
  from,
  to,
  fromLabel = 'base',
  toLabel = 'aligned',
}: {
  def: MetricDef;
  from: EvalMetrics | undefined;
  to: EvalMetrics | undefined;
  fromLabel?: string;
  toLabel?: string;
}) {
  const a = to?.[def.key];
  const b = from?.[def.key];
  return (
    <Card lift className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-muted">{def.label}</p>
        <Delta def={def} from={b} to={a} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        {a != null ? (
          <AnimatedNumber value={a} format={(v) => fmtMetric(def.kind, v)} className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]" />
        ) : (
          <span className="text-2xl font-semibold text-ink-subtle">—</span>
        )}
        <span className="text-2xs font-medium uppercase tracking-wider text-accent-text">{toLabel}</span>
      </div>
      <p className="num mt-1 text-xs text-ink-subtle">
        {fromLabel} <span className="text-ink-muted">{b != null ? fmtMetric(def.kind, b) : '—'}</span>
        <span className="ml-1 text-ink-subtle">· {def.better} is better</span>
      </p>
    </Card>
  );
}
