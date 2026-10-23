import clsx from 'clsx';
import {
  Activity,
  ArrowRight,
  Database,
  Flag,
  History,
  Inbox,
  MessageSquareWarning,
  PencilLine,
  Repeat2,
  ThumbsDown,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GroupedBars } from '../components/ui/charts';
import { Button, Card, CardHeader, PageHeader, Pill, Skeleton, SkeletonText, Stagger } from '../components/ui/primitives';
import { EmptyState, ErrorState } from '../components/ui/states';
import { AnimatedNumber, CodeLine, Modal } from '../components/ui/widgets';
import { ScoreCard } from '../components/support/metrics';
import { METRICS } from '../lib/metrics';
import { api, ApiError } from '../lib/api';
import { dateTime, humanize, int, pct, relTime } from '../lib/format';
import { useToast } from '../lib/toast';
import type { EvalHistoryEntry, FeedbackStats } from '../lib/types';
import { useResource } from '../lib/useResource';
import { DemoLock } from '../components/demo/DemoGate';
import { demoDisabledProps, useIsDemo } from '../lib/demo';

const FLAG_TONE: Record<string, 'danger' | 'warn' | 'violet' | 'neutral'> = {
  thumbs_down: 'danger',
  wrong_escalation: 'danger',
  invalid_json: 'warn',
  low_confidence: 'warn',
  fallback: 'violet',
};

function StatCards({ stats }: { stats: FeedbackStats }) {
  const items = [
    { label: 'Inferences', value: stats.total_inferences, icon: Activity },
    { label: 'Flagged', value: stats.flagged, icon: Flag, hint: stats.total_inferences ? `${pct(stats.flagged / stats.total_inferences, 1)} of total` : undefined },
    { label: 'Thumbs down', value: stats.thumbs_down, icon: ThumbsDown },
    { label: 'Corrections', value: stats.corrections, icon: PencilLine },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon, hint }) => (
        <Card key={label} lift>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-muted">{label}</p>
            <Icon className="h-4 w-4 text-ink-subtle" aria-hidden />
          </div>
          <AnimatedNumber value={value} format={(v) => int(v)} className="mt-3 block text-2xl font-semibold tracking-tight text-ink sm:text-[28px]" />
          <p className="mt-1 h-4 text-xs text-ink-subtle">{hint ?? ''}</p>
        </Card>
      ))}
    </div>
  );
}

function FlagBreakdown({ byFlag }: { byFlag: Record<string, number> }) {
  const entries = Object.entries(byFlag).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="text-sm text-ink-subtle">No flags raised yet.</p>;
  return (
    <ul className="space-y-3">
      {entries.map(([k, v]) => (
        <li key={k}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink-muted">{humanize(k)}</span>
            <span className="num font-medium text-ink">{int(v)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={clsx(
                'h-full rounded-full transition-[width] duration-700',
                FLAG_TONE[k] === 'danger' ? 'bg-danger' : FLAG_TONE[k] === 'warn' ? 'bg-warn' : 'bg-violet',
              )}
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function FlaggedList() {
  const res = useResource(({ signal }) => api.flagged({ signal }), 30000);
  return (
    <Card pad={false}>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <CardHeader
          eyebrow={res.data ? `${res.data.length} flagged` : 'Flagged answers'}
          title="Review queue"
          icon={<MessageSquareWarning className="h-4 w-4" aria-hidden />}
        />
      </div>
      <div className="max-h-[34rem] overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
        {res.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-xl border border-line/60 p-4">
                <Skeleton className="mb-3 h-4 w-2/3" />
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        ) : res.error ? (
          <ErrorState compact error={res.error} onRetry={res.reload} />
        ) : !res.data?.length ? (
          <EmptyState
            compact
            icon={<Inbox className="h-6 w-6" aria-hidden />}
            title="Nothing flagged"
            body="Low-confidence, invalid-JSON, wrong-escalation and thumbs-down answers will land here for review."
          />
        ) : (
          <ul className="space-y-3">
            {res.data.map((f) => (
              <li key={f.inference_id} className="rounded-xl border border-line/70 bg-surface-2/30 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {f.flags.map((fl) => (
                    <Pill key={fl} tone={FLAG_TONE[fl] ?? 'neutral'}>
                      {humanize(fl)}
                    </Pill>
                  ))}
                  <span className="ml-auto text-2xs text-ink-subtle">{relTime(f.created_at)}</span>
                </div>
                <p className="text-sm font-medium text-ink">“{f.query}”</p>
                <p className="mt-1.5 line-clamp-3 text-sm text-ink-muted">{f.answer}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Pill>{humanize(f.intent)}</Pill>
                  {f.policy_ref && <Pill mono tone="accent">{f.policy_ref}</Pill>}
                  {f.escalate_to_human && <Pill tone="danger">escalated</Pill>}
                  <span className="num text-2xs text-ink-subtle">conf {pct(f.confidence)}</span>
                  <span className="truncate font-mono text-2xs text-ink-subtle">{f.model_id}</span>
                </div>
                {f.correction && (
                  <div className="mt-3 rounded-lg border-l-2 border-accent bg-accent/5 px-3 py-2">
                    <p className="eyebrow !text-accent-text">Correction</p>
                    <p className="mt-0.5 text-sm text-ink">{f.correction}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function DatasetCard({ onRealign }: { onRealign: () => void }) {
  const res = useResource(({ signal }) => api.realignDataset({ signal }), 30000);
  const demo = useIsDemo();
  return (
    <Card pad={false}>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <CardHeader
          eyebrow={res.data ? `${int(res.data.count)} items` : 'Re-alignment dataset'}
          title="Training pairs from feedback"
          icon={<Database className="h-4 w-4" aria-hidden />}
          action={
            <DemoLock active={demo}>
              <Button
                size="sm"
                variant="primary"
                onClick={onRealign}
                disabled={!res.data?.count}
                icon={<Repeat2 className="h-3.5 w-3.5" aria-hidden />}
                {...demoDisabledProps(demo)}
              >
                Re-align
              </Button>
            </DemoLock>
          }
        />
      </div>
      <div className="max-h-[22rem] overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
        {res.loading ? (
          <SkeletonText lines={5} />
        ) : res.error ? (
          <ErrorState inline error={res.error} onRetry={res.reload} />
        ) : !res.data?.items.length ? (
          <EmptyState
            compact
            icon={<Database className="h-6 w-6" aria-hidden />}
            title="Dataset is empty"
            body="Submit corrections from the Support Chat (thumbs down → correction) to build instruction/response pairs."
          />
        ) : (
          <ul className="space-y-2.5">
            {res.data.items.map((it, i) => (
              <li key={i} className="rounded-xl border border-line/70 p-3 text-sm">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="eyebrow">Instruction</span>
                  <Pill mono>{it.source}</Pill>
                </div>
                <p className="text-ink">{it.instruction}</p>
                <p className="eyebrow mt-2.5">Response</p>
                <p className="mt-1 text-ink-muted">{it.response}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function BeforeAfter() {
  const res = useResource(({ signal }) => api.evalHistory({ signal }));
  const sorted = useMemo(
    () => [...(res.data ?? [])].sort((a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime()),
    [res.data],
  );
  const [fromId, setFromId] = useState<string>();
  const [toId, setToId] = useState<string>();
  useEffect(() => {
    if (sorted.length >= 2) {
      setFromId((v) => v ?? sorted[0]!.id);
      setToId((v) => v ?? sorted[sorted.length - 1]!.id);
    }
  }, [sorted]);
  const from = sorted.find((e) => e.id === fromId);
  const to = sorted.find((e) => e.id === toId);
  const label = (e: EvalHistoryEntry) => `${e.label || e.id} · ${dateTime(e.generated_at)}`;

  return (
    <Card>
      <CardHeader
        eyebrow="Eval history · aligned model"
        title="Before / after re-alignment"
        icon={<History className="h-4 w-4" aria-hidden />}
      />
      {res.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : res.error && !res.error.isNotFound ? (
        <ErrorState inline error={res.error} onRetry={res.reload} />
      ) : sorted.length < 2 ? (
        <EmptyState
          compact
          icon={<History className="h-6 w-6" aria-hidden />}
          title={sorted.length === 1 ? 'Only one eval so far' : 'No eval history yet'}
          body={
            <>
              <p>Run an eval before and after re-alignment to compare them here.</p>
              <CodeLine className="mt-3 text-left">python -m app.eval run --label after-realign</CodeLine>
            </>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex-1">
              <span className="eyebrow mb-1 block">Before</span>
              <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {sorted.map((e) => (
                  <option key={e.id} value={e.id}>
                    {label(e)}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight className="mx-auto mt-5 hidden h-4 w-4 shrink-0 text-ink-subtle sm:block" aria-hidden />
            <label className="flex-1">
              <span className="eyebrow mb-1 block">After</span>
              <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
                {sorted.map((e) => (
                  <option key={e.id} value={e.id}>
                    {label(e)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {from && to && (
            <>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
                {METRICS.slice(0, 4).map((m) => (
                  <ScoreCard key={m.key} def={m} from={from.summary.aligned} to={to.summary.aligned} fromLabel="before" toLabel="after" />
                ))}
              </div>
              <GroupedBars
                data={METRICS.filter((m) => m.kind === 'rate').map((m) => ({
                  label: m.short,
                  base: from.summary.aligned?.[m.key] ?? null,
                  aligned: to.summary.aligned?.[m.key] ?? null,
                }))}
                names={{ base: from.label || 'Before', aligned: to.label || 'After' }}
                format={(v) => `${(v * 100).toFixed(0)}%`}
                domain={[0, 1]}
                height={240}
                ariaLabel="Aligned model quality rates before and after re-alignment"
              />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export function FeedbackPage() {
  const toast = useToast();
  const stats = useResource(({ signal }) => api.feedbackStats({ signal }), 30000);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const demo = useIsDemo();

  const realign = async () => {
    setBusy(true);
    try {
      const r = await api.realign(true);
      toast({
        tone: 'success',
        title: r.status === 'already_queued' ? 'Re-alignment already queued' : 'Re-alignment queued',
        body: [r.dataset_items != null ? `${r.dataset_items} dataset items` : null, r.job_id ? `job ${r.job_id}` : null].filter(Boolean).join(' · ') || undefined,
      });
    } catch (e) {
      toast({ tone: 'error', title: 'Could not start re-alignment', body: e instanceof ApiError ? e.message : undefined });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Feedback Loop"
        icon={<Repeat2 className="h-5 w-5" aria-hidden />}
        description="Thumbs-down and auto-flagged answers become corrections, corrections become a dataset, and the dataset re-aligns the model."
        actions={
          <DemoLock active={demo}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setConfirm(true)}
              icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
              {...demoDisabledProps(demo)}
            >
              Re-align from feedback
            </Button>
          </DemoLock>
        }
      />
      <Stagger className="space-y-4">
        {stats.loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="glass p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-4 h-7 w-14" />
              </div>
            ))}
          </div>
        ) : stats.error ? (
          <ErrorState inline error={stats.error} onRetry={stats.reload} title={stats.error.isNotFound ? 'Feedback stats unavailable' : 'Feedback stats unavailable — API unreachable'} />
        ) : stats.data ? (
          <StatCards stats={stats.data} />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <FlaggedList />
          <div className="space-y-4">
            <Card>
              <CardHeader eyebrow="Why answers get flagged" title="Flags by type" icon={<Flag className="h-4 w-4" aria-hidden />} />
              {stats.loading ? <SkeletonText lines={4} /> : stats.data ? <FlagBreakdown byFlag={stats.data.by_flag} /> : <p className="text-sm text-ink-subtle">Waiting for feedback stats.</p>}
            </Card>
            <DatasetCard onRealign={() => setConfirm(true)} />
          </div>
        </div>

        <BeforeAfter />
      </Stagger>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Re-align the model from feedback?"
        icon={<Repeat2 className="h-5 w-5" aria-hidden />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} data-autofocus>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void realign()}>
              Use credits & re-align
            </Button>
          </>
        }
      >
        <p>
          This starts a new <span className="font-medium text-ink">realign</span> pipeline run using the correction dataset, which{' '}
          <span className="font-medium text-warn">consumes Nugen credits</span>. Track it on the Alignment Pipeline screen, then run an eval to
          compare before/after.
        </p>
      </Modal>
    </div>
  );
}
