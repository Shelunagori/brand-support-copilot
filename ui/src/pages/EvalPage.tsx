import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, ChartColumn, Check, ChevronRight, FlaskConical, Gauge, ListFilter, Search, ShieldAlert, Timer, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { GroupedBars, type SeriesRow } from '../components/ui/charts';
import { Card, CardHeader, PageHeader, Pill, Skeleton, Stagger } from '../components/ui/primitives';
import { EmptyState, ErrorState } from '../components/ui/states';
import { CodeLine } from '../components/ui/widgets';
import { ScoreCard } from '../components/support/metrics';
import { METRICS } from '../lib/metrics';
import { api } from '../lib/api';
import { dateTime, humanize, ms } from '../lib/format';
import type { EvalQuestion, EvalReport, EvalResult } from '../lib/types';
import { useResource } from '../lib/useResource';

type ModelView = 'both' | 'base' | 'aligned';
type Outcome = 'all' | 'correct' | 'incorrect' | 'improved' | 'regressed';
type SortKey = 'id' | 'category' | 'base_latency' | 'aligned_latency';

function Mark({ ok, label }: { ok: boolean | undefined; label: string }) {
  if (ok === undefined) return <span className="text-ink-subtle">—</span>;
  return (
    <span
      className={clsx('inline-grid h-6 w-6 place-items-center rounded-md', ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}
      aria-label={`${label}: ${ok ? 'correct' : 'incorrect'}`}
      title={`${label}: ${ok ? 'correct' : 'incorrect'}`}
    >
      {ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
    </span>
  );
}

function ResultPanel({ title, r, expectedEscalate, expectedRef, tone }: { title: string; r: EvalResult | undefined; expectedEscalate: boolean; expectedRef: string | null; tone: 'accent' | 'violet' }) {
  if (!r) return <div className="rounded-xl border border-line/70 p-4 text-sm text-ink-subtle">No {title.toLowerCase()} result.</div>;
  return (
    <div className="rounded-xl border border-line/70 bg-surface-2/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Pill tone={tone} className="uppercase tracking-wider">{title}</Pill>
        <Pill tone={r.correct ? 'success' : 'danger'}>{r.correct ? 'correct' : 'incorrect'}</Pill>
        <Pill tone={r.escalation_correct ? 'success' : 'danger'} title={`expected escalate: ${expectedEscalate ? 'yes' : 'no'}`}>
          escalate {r.escalate_to_human ? 'yes' : 'no'}
        </Pill>
        {r.policy_ref ? (
          <Pill mono tone={expectedRef && r.policy_ref === expectedRef ? 'accent' : 'warn'}>{r.policy_ref}</Pill>
        ) : (
          <Pill mono>no ref</Pill>
        )}
        {!r.json_valid && <Pill tone="warn">invalid JSON</Pill>}
        <span className="num ml-auto text-2xs text-ink-subtle">{ms(r.latency_ms)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{r.answer || <span className="text-ink-subtle">(empty)</span>}</p>
      {(r.facts_hit.length > 0 || r.facts_missed.length > 0) && (
        <div className="mt-3 space-y-1.5">
          <p className="eyebrow">Facts</p>
          <div className="flex flex-wrap gap-1.5">
            {r.facts_hit.map((f) => (
              <Pill key={`h-${f}`} tone="success" icon={<Check className="h-3 w-3" aria-hidden />}>{f}</Pill>
            ))}
            {r.facts_missed.map((f) => (
              <Pill key={`m-${f}`} tone="danger" icon={<X className="h-3 w-3" aria-hidden />}>{f}</Pill>
            ))}
          </div>
        </div>
      )}
      {r.violations.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="eyebrow">Violations</p>
          <div className="flex flex-wrap gap-1.5">
            {r.violations.map((v) => (
              <Pill key={v} tone="danger" icon={<ShieldAlert className="h-3 w-3" aria-hidden />}>{v}</Pill>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionTable({ questions }: { questions: EvalQuestion[] }) {
  const [cat, setCat] = useState('all');
  const [view, setView] = useState<ModelView>('both');
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'id', dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set());

  const categories = useMemo(() => [...new Set(questions.map((x) => x.category))].sort(), [questions]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const ok = (x: EvalQuestion, m: 'base' | 'aligned') => x.results[m]?.correct;
    const filtered = questions.filter((x) => {
      if (cat !== 'all' && x.category !== cat) return false;
      if (needle && !`${x.id} ${x.question} ${x.category}`.toLowerCase().includes(needle)) return false;
      const b = ok(x, 'base');
      const a = ok(x, 'aligned');
      switch (outcome) {
        case 'correct':
          return view === 'both' ? !!a && !!b : !!ok(x, view);
        case 'incorrect':
          return view === 'both' ? a === false || b === false : ok(x, view) === false;
        case 'improved':
          return b === false && a === true;
        case 'regressed':
          return b === true && a === false;
        default:
          return true;
      }
    });
    const val = (x: EvalQuestion): string | number => {
      switch (sort.key) {
        case 'category':
          return x.category;
        case 'base_latency':
          return x.results.base?.latency_ms ?? -1;
        case 'aligned_latency':
          return x.results.aligned?.latency_ms ?? -1;
        default:
          return x.id;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return c * sort.dir;
    });
  }, [questions, cat, view, outcome, q, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const sortBtn = (key: SortKey, label: string, className?: string) => (
    <th scope="col" className={clsx('px-3 py-2', className)} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 rounded font-semibold uppercase tracking-wider hover:text-ink">
        {label}
        <ArrowUpDown className={clsx('h-3 w-3', sort.key === key ? 'text-accent-text' : 'opacity-50')} aria-hidden />
      </button>
    </th>
  );
  const showBase = view !== 'aligned';
  const showAligned = view !== 'base';

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <CardHeader
          eyebrow={`${rows.length} of ${questions.length} questions`}
          title="Question-level results"
          icon={<ListFilter className="h-4 w-4" aria-hidden />}
          className="!mb-3"
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <label className="relative">
            <span className="sr-only">Search questions</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <input className="input pl-9" placeholder="Search questions…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Model</span>
            <select className="input" value={view} onChange={(e) => setView(e.target.value as ModelView)}>
              <option value="both">Both models</option>
              <option value="aligned">Aligned only</option>
              <option value="base">Base only</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Correctness</span>
            <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
              <option value="all">Any result</option>
              <option value="correct">Correct</option>
              <option value="incorrect">Incorrect</option>
              <option value="improved">Improved by alignment</option>
              <option value="regressed">Regressed</option>
            </select>
          </label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-t border-line/60 text-left text-sm">
          <thead className="bg-surface-2/40 text-2xs text-ink-subtle">
            <tr>
              <th scope="col" className="w-8 px-3 py-2"><span className="sr-only">Expand</span></th>
              {sortBtn('id', 'ID')}
              {sortBtn('category', 'Category')}
              <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wider">Question</th>
              {showBase && <th scope="col" className="px-3 py-2 text-center font-semibold uppercase tracking-wider">Base</th>}
              {showAligned && <th scope="col" className="px-3 py-2 text-center font-semibold uppercase tracking-wider">Aligned</th>}
              {showAligned ? sortBtn('aligned_latency', 'Latency', 'text-right') : sortBtn('base_latency', 'Latency', 'text-right')}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState compact icon={<Search className="h-6 w-6" aria-hidden />} title="No matching questions" body="Loosen the filters or clear the search." />
                </td>
              </tr>
            )}
            {rows.map((x) => {
              const isOpen = open.has(x.id);
              const toggle = () =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(x.id)) n.delete(x.id);
                  else n.add(x.id);
                  return n;
                });
              return (
                <Fragment key={x.id}>
                  <tr className={clsx('cursor-pointer transition-colors hover:bg-surface-3/30', isOpen && 'bg-surface-3/20')} onClick={toggle}>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${x.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle();
                        }}
                        className="grid h-6 w-6 place-items-center rounded-md text-ink-subtle hover:bg-surface-3 hover:text-ink"
                      >
                        <ChevronRight className={clsx('h-4 w-4 transition-transform', isOpen && 'rotate-90')} aria-hidden />
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink-muted">{x.id}</td>
                    <td className="whitespace-nowrap px-3 py-2.5"><Pill>{humanize(x.category)}</Pill></td>
                    <td className="max-w-[28rem] px-3 py-2.5 text-ink"><p className="line-clamp-2">{x.question}</p></td>
                    {showBase && <td className="px-3 py-2.5 text-center"><Mark ok={x.results.base?.correct} label="Base" /></td>}
                    {showAligned && <td className="px-3 py-2.5 text-center"><Mark ok={x.results.aligned?.correct} label="Aligned" /></td>}
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right text-xs text-ink-muted">
                      {ms((showAligned ? x.results.aligned : x.results.base)?.latency_ms)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface-3/10">
                      <td colSpan={7} className="px-3 pb-4 pt-1 sm:px-5">
                        <AnimatePresence initial>
                          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                            <p className="mb-3 text-sm text-ink">
                              <span className="text-ink-subtle">Q · </span>
                              {x.question}
                            </p>
                            <p className="mb-3 flex flex-wrap gap-1.5 text-xs text-ink-subtle">
                              Expected: <Pill tone={x.expected_escalate ? 'danger' : 'neutral'}>{x.expected_escalate ? 'escalate' : 'no escalation'}</Pill>
                              {x.expected_policy_ref && <Pill mono tone="accent">{x.expected_policy_ref}</Pill>}
                            </p>
                            <div className="grid gap-3 lg:grid-cols-2">
                              {showBase && <ResultPanel title="Base" tone="violet" r={x.results.base} expectedEscalate={x.expected_escalate} expectedRef={x.expected_policy_ref} />}
                              {showAligned && <ResultPanel title="Aligned" tone="accent" r={x.results.aligned} expectedEscalate={x.expected_escalate} expectedRef={x.expected_policy_ref} />}
                            </div>
                          </motion.div>
                        </AnimatePresence>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EvalSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading evaluation">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="glass p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass p-5"><Skeleton className="h-56 w-full" /></div>
        <div className="glass p-5"><Skeleton className="h-56 w-full" /></div>
      </div>
      <div className="glass space-y-3 p-5">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    </div>
  );
}

export function EvalDashboard({ report }: { report: EvalReport }) {
  const { base, aligned } = report.summary;
  const rates: SeriesRow[] = METRICS.filter((m) => m.kind === 'rate').map((m) => ({
    label: m.short,
    base: base ? base[m.key] : null,
    aligned: aligned ? aligned[m.key] : null,
  }));
  const latency: SeriesRow[] = METRICS.filter((m) => m.kind === 'ms').map((m) => ({
    label: m.short,
    base: base ? base[m.key] : null,
    aligned: aligned ? aligned[m.key] : null,
  }));
  return (
    <Stagger className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => (
          <ScoreCard key={m.key} def={m} from={base} to={aligned} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader eyebrow="Rates · 0–100%" title="Quality: base vs aligned" icon={<Gauge className="h-4 w-4" aria-hidden />} />
          <GroupedBars
            data={rates}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            domain={[0, 1]}
            ariaLabel="Grouped bar chart of quality rates for base and aligned models"
          />
          <p className="mt-2 text-xs text-ink-subtle">Violations: lower is better. All other rates: higher is better.</p>
        </Card>
        <Card>
          <CardHeader eyebrow="Milliseconds" title="Latency percentiles" icon={<Timer className="h-4 w-4" aria-hidden />} />
          <GroupedBars
            data={latency}
            format={(v) => ms(v)}
            axisFormat={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`)}
            labelFormat={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`)} ariaLabel="Latency p50 and p95 for base and aligned models" />
          <p className="mt-2 text-xs text-ink-subtle">
            n = {aligned?.n ?? base?.n ?? 0} questions · {aligned?.model_id ? <span className="font-mono">{aligned.model_id}</span> : 'no aligned model'}
          </p>
        </Card>
      </div>
      {report.questions.length > 0 ? (
        <QuestionTable questions={report.questions} />
      ) : (
        <Card>
          <EmptyState compact icon={<ListFilter className="h-6 w-6" aria-hidden />} title="No question-level results" body="This report contains only a summary." />
        </Card>
      )}
    </Stagger>
  );
}

export function EvalPage() {
  const res = useResource(({ signal }) => api.evalLatest({ signal }));
  return (
    <div>
      <PageHeader
        title="Eval Dashboard"
        icon={<ChartColumn className="h-5 w-5" aria-hidden />}
        description={
          res.data ? (
            <>Latest offline evaluation · generated {dateTime(res.data.generated_at)}</>
          ) : (
            'Offline evaluation of base vs aligned on the held-out support question set.'
          )
        }
      />
      {res.loading ? (
        <EvalSkeleton />
      ) : res.error?.isNotFound ? (
        <Card>
          <EmptyState
            icon={<FlaskConical className="h-6 w-6" aria-hidden />}
            title="No evaluation has run yet"
            body={
              <>
                <p>Run the eval harness against both models. Results appear here automatically.</p>
                <CodeLine className="mt-4 text-left">python -m app.eval run</CodeLine>
              </>
            }
          />
        </Card>
      ) : res.error ? (
        <Card>
          <ErrorState error={res.error} onRetry={res.reload} />
        </Card>
      ) : res.data ? (
        <EvalDashboard report={res.data} />
      ) : null}
    </div>
  );
}
