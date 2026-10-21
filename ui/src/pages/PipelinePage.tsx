import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  Check,
  CircleDollarSign,
  FileText,
  FlaskConical,
  GitBranch,
  Hourglass,
  ListChecks,
  Play,
  Radar,
  Rocket,
  Sparkles,
  TriangleAlert,
  Upload,
  Wallet,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, CardHeader, PageHeader, Pill, Skeleton, SkeletonText, Stagger } from '../components/ui/primitives';
import { EmptyState, ErrorState } from '../components/ui/states';
import { CodeLine, CopyButton, Modal, Progress } from '../components/ui/widgets';
import { api, ApiError } from '../lib/api';
import { dateTime, duration, humanize, int, relTime, usd } from '../lib/format';
import { deriveStages, isSettled, pollTransitions, type Stage, type StageKey } from '../lib/pipeline';
import { useToast } from '../lib/toast';
import type { PipelineRun, RunState } from '../lib/types';
import { useResource } from '../lib/useResource';

const STAGE_ICON: Record<StageKey, typeof Upload> = {
  upload: Upload,
  benchmark: FlaskConical,
  align: Sparkles,
  poll: Radar,
  deploy: Rocket,
};

function stateTone(s: RunState) {
  if (s === 'DEPLOYED') return 'success' as const;
  if (s === 'FAILED') return 'danger' as const;
  if (s === 'ALIGNED') return 'accent' as const;
  return 'violet' as const;
}

function StageNode({ stage, index, last }: { stage: Stage; index: number; last: boolean }) {
  const Icon = STAGE_ICON[stage.key];
  const s = stage.status;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { delay: index * 0.06 } }}
      className="relative flex gap-4 pb-6 md:flex-1 md:flex-col md:items-center md:gap-0 md:pb-0 md:text-center"
      aria-current={s === 'active' ? 'step' : undefined}
    >
      {/* connector */}
      {!last && (
        <>
          <span aria-hidden className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px bg-line md:left-[calc(50%+1.5rem)] md:top-5 md:h-px md:w-[calc(100%-3rem)]" />
          <motion.span
            aria-hidden
            className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px origin-top bg-gradient-to-b from-accent to-violet md:left-[calc(50%+1.5rem)] md:top-5 md:h-px md:w-[calc(100%-3rem)] md:origin-left md:bg-gradient-to-r"
            initial={false}
            animate={{ scaleY: s === 'done' ? 1 : 0, scaleX: s === 'done' ? 1 : 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        </>
      )}
      <div
        className={clsx(
          'relative z-10 grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-inset transition-colors',
          s === 'done' && 'bg-accent text-accent-ink ring-accent',
          s === 'active' && 'animate-stage-active bg-accent/10 text-accent-text ring-accent/60',
          s === 'waiting' && 'bg-warn/10 text-warn ring-warn/50',
          s === 'failed' && 'bg-danger/15 text-danger ring-danger/60',
          s === 'pending' && 'bg-surface-2 text-ink-subtle ring-line',
        )}
      >
        {s === 'active' && <span className="skeleton absolute inset-0 !rounded-none !bg-transparent" aria-hidden />}
        {s === 'done' ? (
          <Check className="relative h-4 w-4" strokeWidth={3} aria-hidden />
        ) : s === 'failed' ? (
          <X className="relative h-4 w-4" strokeWidth={3} aria-hidden />
        ) : s === 'waiting' ? (
          <Hourglass className="relative h-4 w-4" aria-hidden />
        ) : (
          <Icon className="relative h-4 w-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 pt-0.5 md:mt-3 md:px-1 md:pt-0">
        <p className="text-sm font-semibold text-ink">{stage.label}</p>
        <p
          className={clsx(
            'text-xs font-medium capitalize',
            s === 'done' && 'text-accent-text',
            s === 'active' && 'text-accent-text',
            s === 'waiting' && 'text-warn',
            s === 'failed' && 'text-danger',
            s === 'pending' && 'text-ink-subtle',
          )}
        >
          {s === 'active' ? 'In progress' : s === 'waiting' ? 'Waiting' : s}
          {stage.seconds != null && <span className="num font-normal text-ink-subtle"> · {duration(stage.seconds)}</span>}
        </p>
        {stage.note && (
          <p
            className={clsx('mt-0.5 line-clamp-2 break-words text-2xs', s === 'failed' ? 'text-danger' : 'text-ink-subtle')}
            title={stage.note}
          >
            {stage.note}
          </p>
        )}
      </div>
    </motion.li>
  );
}

const GHOST: Stage[] = (['upload', 'benchmark', 'align', 'poll', 'deploy'] as const).map((key) => ({
  key,
  label: key === 'upload' ? 'Upload' : key === 'benchmark' ? 'Benchmark' : key === 'align' ? 'Align' : key === 'poll' ? 'Poll' : 'Deploy',
  status: 'pending',
  seconds: null,
  startedAt: null,
  endedAt: null,
}));

/** The pipeline's shape with every stage pending — structure only, no data. */
function GhostTimeline() {
  return (
    <ol className="flex flex-col opacity-70 md:flex-row" aria-label="Pipeline stages (no run yet)">
      {GHOST.map((s, i) => (
        <StageNode key={s.key} stage={s} index={i} last={i === GHOST.length - 1} />
      ))}
    </ol>
  );
}

function IdRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-ink-subtle">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        {value ? (
          <>
            <span className="truncate font-mono text-xs text-ink" title={value}>
              {value}
            </span>
            <CopyButton text={value} label={`Copy ${label}`} />
          </>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        )}
      </dd>
    </div>
  );
}

function SpendCard() {
  const spend = useResource(({ signal }) => api.spend({ signal }), 20000);
  return (
    <Card>
      <CardHeader eyebrow="Nugen credits" title="Spend" icon={<Wallet className="h-4 w-4" aria-hidden />} />
      {spend.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-2 w-full rounded-full" />
          <SkeletonText lines={3} />
        </div>
      ) : spend.error ? (
        <ErrorState inline error={spend.error} onRetry={spend.reload} />
      ) : spend.data ? (
        (() => {
          const d = spend.data;
          const ratio = d.hard_limit_usd > 0 ? d.total_est_usd / d.hard_limit_usd : 0;
          return (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="num text-2xl font-semibold tracking-tight text-ink">{usd(d.total_est_usd)}</p>
                <p className="num text-xs text-ink-subtle">of {usd(d.hard_limit_usd, 2)} hard limit</p>
              </div>
              <div className="mt-3">
                <Progress value={ratio} tone={ratio > 0.9 ? 'danger' : ratio > 0.7 ? 'warn' : 'accent'} label="Spend vs hard limit" />
              </div>
              {d.breakdown.length === 0 ? (
                <p className="mt-4 flex items-center gap-2 text-xs text-ink-subtle">
                  <CircleDollarSign className="h-3.5 w-3.5" aria-hidden /> No billable calls logged yet.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-line/50 text-xs">
                  {d.breakdown.map((r) => (
                    <li key={`${r.purpose}-${r.endpoint}`} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{humanize(r.purpose)}</p>
                        <p className="truncate font-mono text-2xs text-ink-subtle">{r.endpoint}</p>
                      </div>
                      <div className="num shrink-0 text-right">
                        <p className="text-ink">{usd(r.est_cost_usd)}</p>
                        <p className="text-2xs text-ink-subtle">
                          {int(r.calls)} calls · {int(r.tokens)} tok
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()
      ) : null}
    </Card>
  );
}

function RunList({ runs, selected, onSelect }: { runs: PipelineRun[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <Card pad={false}>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <CardHeader eyebrow={`${runs.length} run${runs.length === 1 ? '' : 's'}`} title="Runs" icon={<GitBranch className="h-4 w-4" aria-hidden />} />
      </div>
      <ul className="max-h-80 space-y-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label="Pipeline runs">
        {runs.map((r) => {
          const active = r.id === selected;
          return (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(r.id)}
                className={clsx(
                  'w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                  active ? 'bg-surface-3/70 ring-1 ring-inset ring-line-strong/60' : 'hover:bg-surface-3/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{r.name}</span>
                  <Pill tone={stateTone(r.state)}>{humanize(r.state.toLowerCase())}</Pill>
                </div>
                <div className="mt-1 flex items-center gap-2 text-2xs text-ink-subtle">
                  <span className={clsx('rounded px-1 font-medium uppercase tracking-wider', r.kind === 'realign' ? 'text-violet-text' : '')}>
                    {r.kind}
                  </span>
                  <span>·</span>
                  <span>{relTime(r.created_at)}</span>
                  {r.parent_run_id && (
                    <>
                      <span>·</span>
                      <span className="truncate font-mono">from {r.parent_run_id.slice(0, 8)}</span>
                    </>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function PipelinePage() {
  const toast = useToast();
  const kickUntil = useRef(0);
  const runs = useResource<PipelineRun[]>(
    ({ signal }) => api.runs({ signal }),
    (data) => (Date.now() < kickUntil.current || (data ?? []).some((r) => !isSettled(r)) ? 5000 : null),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'prep' | 'align' | 'deploy'>(null);
  const [now, setNow] = useState(() => Date.now());

  const list = useMemo(() => runs.data ?? [], [runs.data]);
  const run = list.find((r) => r.id === selectedId) ?? list[0];
  const stages = useMemo(() => (run ? deriveStages(run, now) : []), [run, now]);
  const anyActive = stages.some((s) => s.status === 'active');

  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyActive]);

  const act = async (kind: 'prep' | 'align' | 'deploy') => {
    setBusy(kind);
    try {
      const r = kind === 'deploy' ? await api.deploy() : await api.align(kind === 'align');
      kickUntil.current = Date.now() + 120_000;
      runs.reload();
      toast({
        tone: 'success',
        title:
          r.status === 'already_queued'
            ? 'Already queued'
            : kind === 'prep'
              ? 'Preparation queued'
              : kind === 'align'
                ? 'Alignment queued'
                : 'Deployment queued',
        body: r.job_id ? `job ${r.job_id}` : undefined,
      });
    } catch (e) {
      toast({ tone: 'error', title: 'Could not queue job', body: e instanceof ApiError ? e.message : undefined });
    } finally {
      setBusy(null);
      setConfirmOpen(false);
    }
  };

  const canDeploy = list.some((r) => r.model_id);
  const transitions = run ? pollTransitions(run) : [];

  return (
    <div>
      <PageHeader
        title="Alignment Pipeline"
        icon={<Workflow className="h-5 w-5" aria-hidden />}
        description="Policy docs → Nugen benchmark → domain alignment → deployment. Live status, polled every 5s while a run is moving."
        actions={
          <>
            <Button size="sm" onClick={() => void act('prep')} loading={busy === 'prep'} icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />}>
              Prepare (no cost)
            </Button>
            <Button size="sm" variant="primary" onClick={() => setConfirmOpen(true)} icon={<Play className="h-3.5 w-3.5" aria-hidden />}>
              Start alignment
            </Button>
            <Button
              size="sm"
              onClick={() => void act('deploy')}
              loading={busy === 'deploy'}
              disabled={!canDeploy}
              title={canDeploy ? 'Deploy the latest aligned model' : 'No aligned model to deploy yet'}
              icon={<Rocket className="h-3.5 w-3.5" aria-hidden />}
            >
              Deploy
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Stagger className="min-w-0 space-y-4">
          <Card>
            {runs.loading ? (
              <div>
                <Skeleton className="mb-6 h-5 w-48" />
                <div className="flex flex-col gap-6 md:flex-row">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex flex-1 items-center gap-3 md:flex-col">
                      <Skeleton className="h-10 w-10 rounded-xl" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            ) : runs.error ? (
              <>
                <GhostTimeline />
                <div className="mt-6 border-t border-line/50">
                  <ErrorState compact error={runs.error} onRetry={runs.reload} />
                </div>
              </>
            ) : !run ? (
              <>
              <GhostTimeline />
              <div className="mt-6 border-t border-line/50" />
              <EmptyState
                compact
                icon={<Workflow className="h-6 w-6" aria-hidden />}
                title="No alignment runs yet"
                body={
                  <>
                    <p>Start with <span className="font-medium text-ink">Prepare (no cost)</span> to upload the policy pack and build the benchmark, or use the CLI:</p>
                    <CodeLine className="mt-3 text-left">python -m app.cli align</CodeLine>
                  </>
                }
              />
              </>
            ) : (
              <>
                <CardHeader
                  eyebrow={`${run.kind === 'realign' ? 'Re-alignment' : 'Initial'} run · ${dateTime(run.created_at)}`}
                  title={run.name}
                  icon={<Workflow className="h-4 w-4" aria-hidden />}
                  action={
                    <div className="flex items-center gap-2">
                      {runs.fetching && !isSettled(run) && <span className="text-2xs text-ink-subtle">syncing…</span>}
                      <Pill tone={stateTone(run.state)}>{run.state}</Pill>
                    </div>
                  }
                />
                <ol className="mt-2 flex flex-col md:flex-row md:gap-0" aria-label="Pipeline stages">
                  {stages.map((s, i) => (
                    <StageNode key={s.key} stage={s} index={i} last={i === stages.length - 1} />
                  ))}
                </ol>
                {transitions.length > 0 && (
                  <div className="mt-6 flex flex-wrap items-center gap-1.5 rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2">
                    <span className="eyebrow mr-1">Poll</span>
                    {transitions.map((t, i) => (
                      <span key={`${t.status}-${t.at}`} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span className="text-ink-subtle" aria-hidden>→</span>}
                        <Pill tone={t.status === 'READY' ? 'success' : t.status === 'FAILED' ? 'danger' : 'violet'} title={dateTime(t.at)}>
                          {t.status}
                        </Pill>
                      </span>
                    ))}
                  </div>
                )}
                {run.state === 'FAILED' && run.last_error && (
                  <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                    <p className="break-words text-ink">{run.last_error}</p>
                  </div>
                )}
              </>
            )}
          </Card>

          {run && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader eyebrow="Identifiers" title="Artifacts" icon={<FileText className="h-4 w-4" aria-hidden />} />
                <dl className="divide-y divide-line/50">
                  <div className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-xs text-ink-subtle">Documents</dt>
                    <dd className="num text-xs text-ink">{run.document_ids?.length ?? 0}</dd>
                  </div>
                  <IdRow label="Base model" value={run.base_model_id} />
                  <IdRow label="Benchmark" value={run.benchmark_id} />
                  <IdRow label="Alignment" value={run.alignment_id} />
                  <IdRow label="Evaluation" value={run.evaluation_id} />
                  <IdRow label="Model" value={run.model_id} />
                </dl>
                {!!run.document_names?.length && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {run.document_names.map((n) => (
                      <Pill key={n} mono>
                        {n}
                      </Pill>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader eyebrow={`${run.events.length} events`} title="Event log" icon={<ListChecks className="h-4 w-4" aria-hidden />} />
                {run.events.length === 0 ? (
                  <p className="text-sm text-ink-subtle">No events recorded.</p>
                ) : (
                  <ol className="relative max-h-72 space-y-3 overflow-y-auto pl-4 pr-1 before:absolute before:bottom-1 before:left-[3px] before:top-1 before:w-px before:bg-line">
                    {[...run.events].reverse().map((e, i) => (
                      <li key={`${e.step}-${e.at}-${i}`} className="relative">
                        <span
                          aria-hidden
                          className={clsx(
                            'absolute -left-4 top-1.5 h-[7px] w-[7px] rounded-full ring-2 ring-[rgb(var(--surface))]',
                            e.status === 'error' || e.step === 'failed' ? 'bg-danger' : e.status === 'ok' ? 'bg-accent' : 'bg-violet',
                          )}
                        />
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[13px] font-medium text-ink">
                            {humanize(e.step)} <span className="font-normal text-ink-subtle">· {e.status}</span>
                          </p>
                          <time className="num shrink-0 text-2xs text-ink-subtle" dateTime={e.at}>
                            {dateTime(e.at)}
                          </time>
                        </div>
                        {e.detail && Object.keys(e.detail).length > 0 && (
                          <p className="mt-0.5 break-all font-mono text-2xs text-ink-subtle">
                            {Object.entries(e.detail)
                              .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                              .join('  ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          )}
        </Stagger>

        <Stagger className="space-y-4">
          {list.length > 0 && <RunList runs={list} selected={run?.id ?? null} onSelect={setSelectedId} />}
          <SpendCard />
        </Stagger>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Start a paid alignment run?"
        icon={<CircleDollarSign className="h-5 w-5" aria-hidden />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} data-autofocus>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === 'align'} onClick={() => void act('align')}>
              Use credits & start
            </Button>
          </>
        }
      >
        <p>
          This enqueues <code className="font-mono text-ink">run_alignment(confirm=true)</code>, which starts a Nugen domain-alignment job and{' '}
          <span className="font-medium text-warn">consumes credits</span>. The job is resumable and capped by the spend hard limit.
        </p>
        <p className="mt-3">Run “Prepare (no cost)” first if docs and benchmark aren’t ready yet.</p>
      </Modal>
    </div>
  );
}
