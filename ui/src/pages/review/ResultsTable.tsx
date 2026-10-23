import clsx from 'clsx';
import { CloudOff, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, Pill, Skeleton } from '../../components/ui/primitives';
import { EmptyState } from '../../components/ui/states';
import { ms, pct } from '../../lib/format';
import { useEvalHistory, type HistoryEntry, type Metrics } from './hooks';
import { tdClass, thClass } from './styles';

const COLUMNS = [
  'Run',
  'Model',
  'Factual accuracy',
  'Policy violations',
  'Escalation (guardrails)',
  'JSON valid first try',
  'policy_ref',
  'p50 latency',
] as const;

function groupByBase(entries: HistoryEntry[]) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const key = e.base_model_id ?? e.summary.base?.model_id ?? 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()];
}

function MetricCells({ m }: { m: Metrics | undefined }) {
  const cells = m
    ? [
        pct(m.factual_accuracy, 1),
        pct(m.policy_violation_rate, 1),
        pct(m.escalation_accuracy, 1),
        pct(m.json_validity, 1),
        pct(m.policy_ref_accuracy, 1),
        ms(m.latency_p50_ms),
      ]
    : Array.from({ length: 6 }, () => '—');
  return (
    <>
      {cells.map((c, i) => (
        <td key={i} className={clsx(tdClass, 'num whitespace-nowrap text-right text-ink')}>
          {c}
        </td>
      ))}
    </>
  );
}

function RunRows({ entry }: { entry: HistoryEntry }) {
  const rows = (['base', 'aligned'] as const).filter((k) => entry.summary[k]);
  const re = !!entry.rescored;
  return (
    <tbody
      data-testid={re ? 'rescored-run' : 'eval-run'}
      className={clsx(
        'border-t border-line/60',
        re && 'bg-[repeating-linear-gradient(135deg,rgb(var(--violet)/0.06)_0_8px,transparent_8px_16px)]',
      )}
    >
      {rows.map((k, i) => {
        const m = entry.summary[k];
        return (
          <tr key={k} className={clsx(i > 0 && 'border-t border-dashed border-line/50')}>
            {i === 0 && (
              <th
                scope="rowgroup"
                rowSpan={rows.length}
                className={clsx(tdClass, 'min-w-[13rem] max-w-[16rem] text-left font-normal', re && 'border-l-2 border-violet')}
              >
                <span className="block text-[13px] font-medium leading-5 text-ink">{entry.label}</span>
                {re && (
                  <Pill tone="violet" className="mt-1.5" icon={<RotateCcw className="h-3 w-3 shrink-0" aria-hidden />}>
                    offline re-score · not a new run
                  </Pill>
                )}
              </th>
            )}
            <td className={clsx(tdClass, 'whitespace-nowrap')}>
              <span className="flex items-center gap-2">
                <span
                  className={clsx('h-2 w-2 shrink-0 rounded-full', k === 'base' ? 'bg-series-base' : 'bg-series-aligned')}
                  aria-hidden
                />
                <span className="text-[13px] font-medium capitalize text-ink">{k}</span>
              </span>
              {m && <span className="mt-0.5 block pl-4 font-mono text-2xs text-ink-subtle">{m.model_id}</span>}
            </td>
            <MetricCells m={m} />
          </tr>
        );
      })}
    </tbody>
  );
}

function TableSkeleton() {
  return (
    <div className="glass overflow-hidden p-4 sm:p-5" aria-busy="true" aria-label="Loading eval history">
      <Skeleton className="mb-4 h-4 w-56" />
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="mb-5 space-y-2.5">
          <Skeleton className="h-3 w-40" />
          {Array.from({ length: 4 }, (_, r) => (
            <div key={r} className="flex gap-3">
              <Skeleton className="h-9 w-1/4" />
              <Skeleton className="h-9 flex-1" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ResultsTable() {
  const { state, retry } = useEvalHistory();

  if (state.status === 'loading') return <TableSkeleton />;
  if (state.status === 'error')
    return (
      <div className="glass">
        <EmptyState
          compact
          icon={<CloudOff className="h-6 w-6" aria-hidden />}
          title="Eval history unavailable"
          body="The bundled snapshot could not be read."
          action={
            <Button size="sm" onClick={retry} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
              Try again
            </Button>
          }
        />
      </div>
    );
  if (state.entries.length === 0)
    return (
      <div className="glass">
        <EmptyState compact icon={<CloudOff className="h-6 w-6" aria-hidden />} title="No eval runs in the snapshot" />
      </div>
    );

  return (
    <div className="space-y-4">
      {groupByBase(state.entries).map(([base, entries]) => (
        <div key={base} className="glass overflow-hidden" data-testid="results-group">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/60 px-4 py-3 sm:px-5">
            <span className="eyebrow">Base model</span>
            <span className="font-mono text-[13px] text-ink">{base}</span>
          </div>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Eval runs for ${base}`}>
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-surface-2/40">
                <tr>
                  {COLUMNS.map((c, i) => (
                    <th key={c} scope="col" className={clsx(thClass, i >= 2 && 'text-right', c === 'policy_ref' && 'normal-case font-mono tracking-normal')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              {entries.map((e) => (
                <RunRows key={e.id} entry={e} />
              ))}
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
