import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ArrowRight, Check, GitCompareArrows, Minus, Scale, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlignedOfflineBadge, AlignedOfflineCard } from '../components/support/AlignedOffline';
import { AnswerCard } from '../components/support/AnswerCard';
import { api } from '../lib/api';
import { useResource } from '../lib/useResource';
import { Button, Card, CardHeader, PageHeader, Pill, Stagger } from '../components/ui/primitives';
import { EmptyState } from '../components/ui/states';
import { diffStats, wordDiff } from '../lib/diff';
import { POLICY_REF_RE, humanize, ms, pct } from '../lib/format';
import type { ModelKind, SupportResponse } from '../lib/types';
import { initialStream, runStream, type StreamState } from '../lib/useStream';
import { EXAMPLES } from '../lib/examples';

type Pair = Record<ModelKind, StreamState>;

function heuristicScore(r: SupportResponse, other: SupportResponse): number {
  let s = 0;
  if (r.policy_ref && POLICY_REF_RE.test(r.policy_ref)) s++;
  if (!r.fallback) s++;
  if (r.confidence > other.confidence) s++;
  return s;
}

function Diff({ a, b }: { a: string; b: string }) {
  const ops = useMemo(() => wordDiff(a, b), [a, b]);
  const stats = useMemo(() => diffStats(ops), [ops]);
  return (
    <Card>
      <CardHeader
        eyebrow="Word-level diff · LCS"
        title="How the aligned answer differs from base"
        icon={<GitCompareArrows className="h-4 w-4" aria-hidden />}
        action={
          <div className="flex items-center gap-1.5 text-xs">
            <Pill tone="danger" className="num">−{stats.del}</Pill>
            <Pill tone="accent" className="num">+{stats.add}</Pill>
            <Pill className="num">{pct(stats.similarity)} same</Pill>
          </div>
        }
      />
      <p className="text-[15px] leading-8 text-ink">
        {ops.map((o, i) =>
          o.type === 'same' ? (
            <span key={i}>{o.text}</span>
          ) : o.type === 'del' ? (
            <del
              key={i}
              className="rounded bg-danger/10 px-0.5 text-danger decoration-danger/60"
              aria-label={`removed: ${o.text.trim()}`}
            >
              {o.text}
            </del>
          ) : (
            <ins
              key={i}
              className="rounded bg-accent/15 px-0.5 text-accent-text no-underline"
              aria-label={`added: ${o.text.trim()}`}
            >
              {o.text}
            </ins>
          ),
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger/40" aria-hidden /> only in base
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent/50" aria-hidden /> only in aligned
        </span>
      </div>
    </Card>
  );
}

function YesNo({ v, good }: { v: boolean; good: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1', good ? 'text-success' : 'text-ink-muted')}>
      {v ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
      {v ? 'yes' : 'no'}
    </span>
  );
}

function FieldTable({ base, aligned }: { base: SupportResponse; aligned: SupportResponse }) {
  const sb = heuristicScore(base, aligned);
  const sa = heuristicScore(aligned, base);
  const winner: ModelKind | null = sa > sb ? 'aligned' : sb > sa ? 'base' : null;
  const rows: { label: string; render: (r: SupportResponse) => ReactNode }[] = [
    { label: 'Intent', render: (r) => humanize(r.intent) },
    {
      label: 'Policy ref',
      render: (r) =>
        r.policy_ref ? (
          <Pill mono tone={POLICY_REF_RE.test(r.policy_ref) ? 'accent' : 'warn'}>
            {r.policy_ref}
          </Pill>
        ) : (
          <span className="text-ink-subtle">none</span>
        ),
    },
    {
      label: 'Escalate',
      render: (r) => (r.escalate_to_human ? <Pill tone="danger">escalate</Pill> : <span className="text-ink-muted">no</span>),
    },
    { label: 'Confidence', render: (r) => <span className="num">{pct(r.confidence)}</span> },
    { label: 'Latency', render: (r) => <span className="num">{ms(r.latency_ms)}</span> },
    { label: 'JSON valid 1st try', render: (r) => <YesNo v={r.json_valid_first_try} good={r.json_valid_first_try} /> },
    { label: 'Fallback', render: (r) => (r.fallback ? <Pill tone="danger">fallback</Pill> : <YesNo v={false} good />) },
    { label: 'Heuristic score', render: (r) => <span className="num font-semibold">{r === base ? sb : sa} / 3</span> },
  ];
  const col = (k: ModelKind) =>
    clsx('px-3 py-2.5 text-sm', winner === k && 'bg-accent/[0.07]', k === 'aligned' ? 'text-ink' : 'text-ink');

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <CardHeader
          className="!mb-1"
          eyebrow="Field comparison"
          title="Which side followed policy?"
          icon={<Scale className="h-4 w-4" aria-hidden />}
          action={<Pill tone="warn">heuristic</Pill>}
        />
        <p className="text-xs text-ink-subtle">
          Ground-truth escalation checks run server-side in the eval. Here we score each reply on: a valid <code className="font-mono">UT-XXX-000</code>{' '}
          policy_ref, no fallback, and higher confidence.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-t border-line/60 text-left">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-ink-subtle">
              <th scope="col" className="px-3 py-2 font-semibold sm:pl-5">Field</th>
              {(['base', 'aligned'] as const).map((k) => (
                <th key={k} scope="col" className={clsx('px-3 py-2 font-semibold', winner === k && 'bg-accent/[0.07] text-accent-text')}>
                  <span className="inline-flex items-center gap-1.5">
                    {k}
                    {winner === k && <Trophy className="h-3.5 w-3.5" aria-label="heuristic winner" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-[13px] font-medium text-ink-muted sm:pl-5">
                  {row.label}
                </th>
                <td className={col('base')}>{row.render(base)}</td>
                <td className={col('aligned')}>{row.render(aligned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line/60 px-4 py-3 text-sm sm:px-5">
        {winner ? (
          <p className="text-ink">
            Heuristic verdict: <span className="font-semibold text-accent-text">{winner}</span> looks more policy-compliant on this question.
          </p>
        ) : (
          <p className="text-ink-muted">Heuristic verdict: tie — inspect the answers and diff.</p>
        )}
      </div>
    </Card>
  );
}

export function ComparePage() {
  const [q, setQ] = useState('');
  const [pair, setPair] = useState<Pair | null>(null);
  // aligned model undeployed at the time of the run: base only, offline card for aligned
  const [offlineRun, setOfflineRun] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const models = useResource(({ signal }) => api.models({ signal }));
  const alignedOffline = !!models.data && !models.data.aligned_model_id;
  const busy =
    !!pair && (pair.base.status === 'streaming' || (!offlineRun && pair.aligned.status === 'streaming'));

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = (text?: string) => {
    const query = (text ?? q).trim();
    if (!query || busy) return;
    if (text) setQ(text);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setPair({ base: initialStream(query, 'base'), aligned: initialStream(query, 'aligned') });
    setOfflineRun(alignedOffline);
    (alignedOffline ? (['base'] as const) : (['base', 'aligned'] as const)).forEach((k) => {
      void runStream(query, k, (fn) => setPair((p) => (p ? { ...p, [k]: fn(p[k]) } : p)), c.signal);
    });
  };

  const bothDone = !offlineRun && pair?.base.final && pair.aligned.final;

  return (
    <div>
      <PageHeader
        title="Base vs Aligned"
        icon={<GitCompareArrows className="h-5 w-5" aria-hidden />}
        description="Send one customer question to both models in parallel and see how domain alignment changes the answer."
      />
      {alignedOffline && (
        <div className="-mt-2 mb-4">
          <AlignedOfflineBadge modelId={models.data?.offline_aligned_model_id} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="glass mb-4 flex flex-col gap-2 p-2 sm:flex-row"
      >
        <label htmlFor="cmp-q" className="sr-only">
          Question for both models
        </label>
        <input
          id="cmp-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Can I return a kurta bought during the sale?"
          className="h-11 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none"
        />
        <Button type="submit" variant="primary" className="!h-11" loading={busy} disabled={!q.trim()} icon={<ArrowRight className="h-4 w-4" aria-hidden />}>
          Compare
        </Button>
      </form>
      <div className="mb-6 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            disabled={busy}
            onClick={() => run(e)}
            className="rounded-full border border-line/80 bg-surface/70 px-3 py-1 text-xs text-ink-muted transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
          >
            {e}
          </button>
        ))}
      </div>

      {!pair ? (
        <Card>
          <EmptyState
            icon={<GitCompareArrows className="h-6 w-6" aria-hidden />}
            title="Nothing compared yet"
            body="Pick an example or type a question. Both models stream side by side; once both finish you'll get a word diff and a field-by-field verdict."
          />
        </Card>
      ) : (
        <Stagger className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {(['base', 'aligned'] as const).map((k) => (
              <motion.section key={k} aria-label={`${k} model`} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-ink">
                  <span className={clsx('h-2 w-2 rounded-full', k === 'aligned' ? 'bg-accent' : 'bg-violet')} aria-hidden />
                  {k === 'aligned' ? 'Aligned model' : 'Base model'}
                </h2>
                {k === 'aligned' && offlineRun ? (
                  <AlignedOfflineCard modelId={models.data?.offline_aligned_model_id} />
                ) : (
                  <AnswerCard s={pair[k]} compact onRetry={() => run(pair[k].query)} />
                )}
              </motion.section>
            ))}
          </div>
          {bothDone && pair.base.final && pair.aligned.final && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid items-start gap-4 xl:grid-cols-[1.25fr_1fr]"
            >
              <Diff a={pair.base.final.answer} b={pair.aligned.final.answer} />
              <FieldTable base={pair.base.final} aligned={pair.aligned.final} />
            </motion.div>
          )}
        </Stagger>
      )}
    </div>
  );
}
