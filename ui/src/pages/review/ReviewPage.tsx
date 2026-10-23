import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  Boxes,
  CircleCheck,
  CircleDot,
  Cloud,
  Database,
  FlaskConical,
  GitBranch,
  KeyRound,
  Layers,
  Lock,
  Monitor,
  PowerOff,
  Server,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  TrendingDown,
  TriangleAlert,
  Wallet,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill, Stagger } from '../../components/ui/primitives';
import {
  ARCHITECTURE,
  ARCHITECTURE_NOTE,
  BILLING_ROWS,
  BILLING_TOTAL,
  DECISIONS,
  DECISIONS_NOTE,
  DEPLOYMENT,
  FEEDBACK_REAL,
  FEEDBACK_STEPS,
  FINDINGS,
  GUARDRAIL_NOTE,
  GUARDRAILS,
  HERO,
  IDLE_HOSTING,
  INCIDENT,
  INFERENCE_STEPS,
  LAYER_LEGEND,
  LINKS,
  NUGEN_NOTES,
  OPEN_QUESTIONS,
  OVERVIEW_CARDS,
  PIPELINE_409,
  PIPELINE_PROPERTIES,
  PIPELINE_RUNS,
  PIPELINE_STEPS,
  RAG_NOTE,
  RAG_TABLE,
  RATE_CARD,
  SAFETY,
  SECTIONS,
  SIGNIFICANCE,
  TESTING,
  TESTING_NOTE,
  type Layer,
} from './content';
import {
  Callout,
  GitHubMark,
  LayerBadge,
  Legend,
  NumberedFlow,
  Section,
  StatTile,
} from './parts';
import { useSectionNav } from './hooks';
import { LAYER_STYLE, linkBtn, tdClass, thClass } from './styles';
import { ResultsTable } from './ResultsTable';
import { SectionChipBar, SectionRail } from './SectionNav';

const title = (id: (typeof SECTIONS)[number]['id']) => SECTIONS.find((s) => s.id === id)?.label ?? id;
const index = (id: (typeof SECTIONS)[number]['id']) => SECTIONS.findIndex((s) => s.id === id) + 1;

function External({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ Hero */

function Hero() {
  return (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="glass relative mb-6 overflow-hidden px-5 py-8 sm:px-10 sm:py-12 xl:mb-14"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-accent/15 blur-3xl" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgb(var(--ink)/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--ink)/0.035)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_80%_0%,#000,transparent_65%)]"
        aria-hidden
      />
      <div className="relative">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-ink-muted ring-1 ring-inset ring-line">
          <BookOpenText className="h-3.5 w-3.5 text-accent-text" aria-hidden />
          {HERO.eyebrow}
        </p>
        <h1 className="mt-5 bg-gradient-to-br from-ink via-ink to-violet-text bg-clip-text text-[2rem] font-semibold leading-[1.1] tracking-tight text-transparent sm:text-5xl">
          {HERO.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base font-medium leading-7 text-ink sm:text-lg">{HERO.subtitle}</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted sm:text-[15px] sm:leading-7">{HERO.summary}</p>
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Badges">
          {HERO.badges.map((b, i) => (
            <li key={b}>
              <Pill tone={i === 0 ? 'neutral' : i === 1 ? 'accent' : 'violet'} icon={<CircleDot className="h-3 w-3 shrink-0" aria-hidden />}>
                {b}
              </Pill>
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <Link to={LINKS.compare} className={linkBtn.primary}>
            Open Compare
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <External href={LINKS.github} className={linkBtn.secondary}>
            <GitHubMark className="h-4 w-4" />
            View GitHub
          </External>
          <External href={LINKS.ragProject} className={linkBtn.secondary}>
            Previous project: RAG agent
            <ArrowUpRight className="h-4 w-4 text-ink-subtle" aria-hidden />
          </External>
          <External href={LINKS.ragReview} className={linkBtn.ghost}>
            RAG agent review
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </External>
        </div>
      </div>
    </motion.header>
  );
}

/* -------------------------------------------------------------- Overview */

const OVERVIEW_ICONS: LucideIcon[] = [Workflow, BookOpenText, FlaskConical, Lock];

function Overview() {
  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {OVERVIEW_CARDS.map((c, i) => {
        const Icon = OVERVIEW_ICONS[i % OVERVIEW_ICONS.length]!;
        return (
          <Card key={c.title} lift className="flex flex-col">
            <span className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet/20 to-accent/15 text-accent-text ring-1 ring-inset ring-line">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
            <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{c.body}</p>
          </Card>
        );
      })}
    </Stagger>
  );
}

/* ---------------------------------------------------------- Architecture */

const ARCH_ICONS: Record<Layer, LucideIcon[]> = {
  client: [Monitor],
  deterministic: [Server],
  model: [Sparkles, Workflow],
  data: [Database, Zap],
};

function ArchNode({ name, detail, layer, i }: { name: string; detail: string; layer: Layer; i: number }) {
  const s = LAYER_STYLE[layer];
  const icons = ARCH_ICONS[layer];
  const Icon = icons[i % icons.length]!;
  return (
    <div className="glass relative overflow-hidden p-4" data-layer={layer}>
      <span className={clsx('absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r', s.bar)} aria-hidden />
      <div className="flex items-start gap-3">
        <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset', s.bg, s.text, s.ring)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-ink">{name}</h3>
            <LayerBadge layer={layer} />
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function Wire({ className }: { className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center', className)} aria-hidden>
      <span className="h-5 w-px bg-gradient-to-b from-line-strong to-accent/60" />
      <ArrowDown className="-mt-1 h-3.5 w-3.5 text-accent-text" />
    </div>
  );
}

function Architecture() {
  const by = (l: Layer) => ARCHITECTURE.filter((a) => a.layer === l);
  const groups: Layer[] = ['model', 'data'];
  const layers = Object.keys(LAYER_LEGEND) as Layer[];
  return (
    <div className="space-y-4">
      <div className="glass relative overflow-hidden p-4 sm:p-6" role="figure" aria-label="Architecture diagram">
        <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(var(--ink)/0.06)_1px,transparent_1px)] [background-size:18px_18px]" aria-hidden />
        <div className="relative">
          <div className="mx-auto max-w-xl space-y-0">
            {by('client').map((a, i) => (
              <ArchNode key={a.name} {...a} i={i} />
            ))}
            <Wire className="py-1" />
            {by('deterministic').map((a, i) => (
              <ArchNode key={a.name} {...a} i={i} />
            ))}
          </div>

          {/* fork: one wire down on mobile, a bracket into two groups from md */}
          <Wire className="py-1 md:hidden" />
          <div className="relative mx-auto hidden h-9 md:block" aria-hidden>
            <span className="absolute left-1/2 top-0 h-4 w-px bg-line-strong" />
            <span className="absolute left-1/4 right-1/4 top-4 h-px bg-gradient-to-r from-violet/60 via-line-strong to-info/60" />
            <span className="absolute left-1/4 top-4 h-5 w-px bg-violet/60" />
            <span className="absolute right-1/4 top-4 h-5 w-px bg-info/60" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <div
                key={g}
                className={clsx('rounded-2xl border border-dashed p-2.5 sm:p-3', g === 'model' ? 'border-violet/40 bg-violet/[0.04]' : 'border-info/40 bg-info/[0.04]')}
              >
                <p className={clsx('mb-2.5 px-1 text-2xs font-semibold uppercase tracking-[0.12em]', LAYER_STYLE[g].text)}>
                  {LAYER_LEGEND[g]}
                </p>
                <div className="space-y-2.5">
                  {by(g).map((a, i) => (
                    <ArchNode key={a.name} {...a} i={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Legend layers={layers} className="px-1" />
      <Callout icon={<Layers className="h-3.5 w-3.5" aria-hidden />}>{ARCHITECTURE_NOTE}</Callout>
    </div>
  );
}

/* -------------------------------------------------------------- Pipeline */

function Pipeline() {
  const cols = ['Run', 'Upload', 'Docs ready', 'Benchmark', 'Align', 'Deploy', 'Model'];
  return (
    <div className="space-y-5">
      <NumberedFlow steps={PIPELINE_STEPS} cols={5} />
      <Card pad={false} className="p-4 sm:p-5">
        <ul className="space-y-2.5">
          {PIPELINE_PROPERTIES.map((p) => (
            <li key={p} className="flex gap-2.5 text-sm leading-6 text-ink-muted">
              <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Pipeline step timings">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-2/40">
              <tr>
                {cols.map((c, i) => (
                  <th key={c} scope="col" className={clsx(thClass, i > 0 && i < 6 && 'text-right', i === 0 && 'sm:pl-5')}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PIPELINE_RUNS.map((r) => (
                <tr key={r.model} className="border-t border-line/60">
                  <th scope="row" className={clsx(tdClass, 'min-w-[14rem] text-[13px] font-medium text-ink sm:pl-5')}>
                    {r.run}
                  </th>
                  {[r.upload, r.docsReady, r.benchmark, r.align, r.deploy].map((v, i) => (
                    <td key={i} className={clsx(tdClass, 'num whitespace-nowrap text-right text-ink')}>
                      {v}
                    </td>
                  ))}
                  <td className={clsx(tdClass, 'whitespace-nowrap font-mono text-xs text-ink-muted')}>{r.model}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Callout tone="warn" title={PIPELINE_409.title}>
        {PIPELINE_409.body}
      </Callout>
    </div>
  );
}

/* ------------------------------------------------------------- Inference */

function Inference() {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ol className="relative">
          {INFERENCE_STEPS.map((s, i) => {
            const st = LAYER_STYLE[s.kind];
            return (
              <li key={s.step} className="relative flex gap-3 pb-3 last:pb-0" data-kind={s.kind}>
                {i < INFERENCE_STEPS.length - 1 && (
                  <span className="absolute bottom-0 left-[15px] top-8 w-px bg-line" aria-hidden />
                )}
                <span
                  className={clsx(
                    'num relative z-[1] mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface font-mono text-xs font-semibold ring-1 ring-inset',
                    st.text,
                    st.ring,
                  )}
                >
                  {i + 1}
                </span>
                <div className="glass min-w-0 flex-1 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{s.step}</p>
                    <LayerBadge layer={s.kind} />
                  </div>
                  <p className="mt-1 break-words text-[13px] leading-5 text-ink-muted">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-36 xl:top-24">
            <div className="mb-3 flex items-center gap-2.5">
              <span className={clsx('grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset', LAYER_STYLE.deterministic.bg, LAYER_STYLE.deterministic.text, LAYER_STYLE.deterministic.ring)}>
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold text-ink">Guardrails</h3>
            </div>
            <ul className="space-y-2">
              {GUARDRAILS.map((g) => (
                <li key={g} className="flex gap-2.5 rounded-xl bg-surface-2/50 px-3 py-2 text-[13px] leading-5 text-ink-muted ring-1 ring-inset ring-line/60">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
            <Legend layers={['deterministic', 'model']} className="mt-4 border-t border-line/60 pt-3" />
          </Card>
        </div>
      </div>
      <Callout icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}>{GUARDRAIL_NOTE}</Callout>
    </div>
  );
}

/* --------------------------------------------------------------- Results */

type FindingTone = 'danger' | 'warn' | 'success';
const findingTone = (t: string): FindingTone =>
  /held/i.test(t) ? 'success' : /json repair/i.test(t) ? 'warn' : 'danger';
const TONE_ORDER: Record<FindingTone, number> = { danger: 0, warn: 1, success: 2 };

function Results() {
  const findings = [...FINDINGS]
    .map((f) => ({ ...f, tone: findingTone(f.title) }))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  return (
    <div className="space-y-5">
      <ResultsTable />
      <Callout icon={<FlaskConical className="h-3.5 w-3.5" aria-hidden />}>{SIGNIFICANCE}</Callout>
      <Stagger className="grid gap-3 md:grid-cols-2">
        {findings.map((f, i) => {
          const Icon = f.tone === 'success' ? ShieldCheck : f.tone === 'warn' ? TriangleAlert : TrendingDown;
          return (
            <Card
              key={f.title}
              data-tone={f.tone}
              className={clsx('relative overflow-hidden', i === 0 && 'md:col-span-2')}
            >
              <span
                className={clsx(
                  'absolute inset-y-0 left-0 w-[3px]',
                  f.tone === 'danger' ? 'bg-danger' : f.tone === 'warn' ? 'bg-warn' : 'bg-success',
                )}
                aria-hidden
              />
              <div className="flex gap-3">
                <span
                  className={clsx(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
                    f.tone === 'danger' && 'bg-danger/10 text-danger ring-danger/30',
                    f.tone === 'warn' && 'bg-warn/10 text-warn ring-warn/30',
                    f.tone === 'success' && 'bg-success/10 text-success ring-success/30',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className={clsx('font-semibold text-ink', i === 0 ? 'text-base' : 'text-sm')}>{f.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{f.body}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </Stagger>
      <Link to={LINKS.eval} className={clsx(linkBtn.secondary, 'w-full sm:w-auto')}>
        Open the Eval Dashboard
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------- Feedback */

function Feedback() {
  return (
    <div className="space-y-5">
      <NumberedFlow steps={FEEDBACK_STEPS} cols={4} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEEDBACK_REAL.map((s) => (
          <StatTile key={s.label} value={s.value} label={s.label} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- RAG vs alignment */

function RagVsAlignment() {
  const heads = ['RAG', 'Domain alignment'] as const;
  return (
    <div className="space-y-5">
      {/* table from md */}
      <div className="glass hidden overflow-hidden md:block">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[39%]" />
            <col className="w-[39%]" />
          </colgroup>
          <thead className="bg-surface-2/40">
            <tr>
              <th scope="col" className={clsx(thClass, 'pl-5')}>
                <span className="sr-only">Dimension</span>
              </th>
              <th scope="col" className={thClass}>{heads[0]}</th>
              <th scope="col" className={clsx(thClass, 'text-accent-text')}>{heads[1]}</th>
            </tr>
          </thead>
          <tbody>
            {RAG_TABLE.map((r) => (
              <tr key={r.dimension} className="border-t border-line/60">
                <th scope="row" className={clsx(tdClass, 'py-3 pl-5 text-[13px] font-semibold text-ink')}>
                  {r.dimension}
                </th>
                <td className={clsx(tdClass, 'py-3 text-[13px] leading-5 text-ink-muted')}>{r.rag}</td>
                <td className={clsx(tdClass, 'bg-accent/[0.035] py-3 text-[13px] leading-5 text-ink')}>{r.alignment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* stacked below md */}
      <ul className="space-y-3 md:hidden">
        {RAG_TABLE.map((r) => (
          <li key={r.dimension} className="glass p-4">
            <p className="text-sm font-semibold text-ink">{r.dimension}</p>
            <dl className="mt-2.5 space-y-2.5">
              <div className="rounded-xl bg-surface-2/50 p-3 ring-1 ring-inset ring-line/60">
                <dt className="eyebrow">{heads[0]}</dt>
                <dd className="mt-1 text-[13px] leading-5 text-ink-muted">{r.rag}</dd>
              </div>
              <div className="rounded-xl bg-accent/[0.05] p-3 ring-1 ring-inset ring-accent/25">
                <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-accent-text">{heads[1]}</dt>
                <dd className="mt-1 text-[13px] leading-5 text-ink">{r.alignment}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <Callout>{RAG_NOTE}</Callout>
      <External href={LINKS.ragProject} className={clsx(linkBtn.secondary, 'w-full sm:w-auto')}>
        <GitHubMark className="h-4 w-4" />
        Previous project: RAG agent
        <ArrowUpRight className="h-4 w-4 text-ink-subtle" aria-hidden />
      </External>
    </div>
  );
}

/* ---------------------------------------------------------------- Safety */

const SAFETY_ICONS: LucideIcon[] = [Monitor, KeyRound, ShieldOff, Wallet, PowerOff, Lock];

function Safety() {
  return (
    <div className="space-y-5">
      <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SAFETY.map((s, i) => {
          const Icon = SAFETY_ICONS[i % SAFETY_ICONS.length]!;
          return (
            <Card key={s.title} lift>
              <span className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-surface-3/70 text-ink-muted ring-1 ring-inset ring-line/70">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{s.body}</p>
            </Card>
          );
        })}
      </Stagger>
      <Callout tone="warn" title={INCIDENT.title}>
        {INCIDENT.body}
      </Callout>
    </div>
  );
}

/* ------------------------------------------------------------------ Cost */

function Cost() {
  const totals = [
    { label: 'Used', value: BILLING_TOTAL.used },
    { label: 'Balance', value: BILLING_TOTAL.balance },
    { label: 'As of', value: BILLING_TOTAL.asOf },
  ];
  return (
    <div className="space-y-5">
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Billing">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-surface-2/40">
              <tr>
                <th scope="col" className={clsx(thClass, 'sm:pl-5')}>Item</th>
                <th scope="col" className={clsx(thClass, 'text-right')}>Amount</th>
                <th scope="col" className={thClass}>Note</th>
              </tr>
            </thead>
            <tbody>
              {BILLING_ROWS.map((r) => (
                <tr key={r.item} className="border-t border-line/60">
                  <th scope="row" className={clsx(tdClass, 'text-[13px] font-medium text-ink sm:pl-5')}>{r.item}</th>
                  <td className={clsx(tdClass, 'num whitespace-nowrap text-right font-medium text-ink')}>{r.inr}</td>
                  <td className={clsx(tdClass, 'text-xs leading-5 text-ink-subtle')}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {totals.map((t) => (
          <div key={t.label} className="glass p-4 sm:p-5">
            <p className="eyebrow">{t.label}</p>
            <p className="num mt-1.5 text-[15px] font-semibold leading-6 text-ink">{t.value}</p>
          </div>
        ))}
      </div>

      <div className="glass overflow-hidden">
        <div className="border-b border-line/60 px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-ink">Rate card</p>
          <p className="mt-0.5 text-xs leading-5 text-ink-subtle">{RATE_CARD.source}</p>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Rate card">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-surface-2/40">
              <tr>
                <th scope="col" className={clsx(thClass, 'sm:pl-5')}>Tier</th>
                <th scope="col" className={clsx(thClass, 'text-right')}>General</th>
                <th scope="col" className={clsx(thClass, 'text-right')}>Aligned</th>
                <th scope="col" className={clsx(thClass, 'text-right sm:pr-5')}>Alignment</th>
              </tr>
            </thead>
            <tbody>
              {RATE_CARD.rows.map((r) => (
                <tr key={r.tier} className="border-t border-line/60">
                  <th scope="row" className={clsx(tdClass, 'whitespace-nowrap text-[13px] font-medium text-ink sm:pl-5')}>{r.tier}</th>
                  <td className={clsx(tdClass, 'num whitespace-nowrap text-right text-ink')}>{r.general}</td>
                  <td className={clsx(tdClass, 'num whitespace-nowrap text-right text-ink')}>{r.aligned}</td>
                  <td className={clsx(tdClass, 'num whitespace-nowrap text-right text-ink sm:pr-5')}>{r.alignment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-line/60 px-4 py-3 text-xs leading-5 sm:px-5">
          <p className="font-mono text-ink-muted">{RATE_CARD.unit}</p>
          <p className="text-ink-subtle">{RATE_CARD.caveat}</p>
        </div>
      </div>

      <div className="glass flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3/70 text-ink-muted ring-1 ring-inset ring-line/70">
          <Cloud className="h-5 w-5" aria-hidden />
        </span>
        <p className="num text-[1.75rem] font-semibold tracking-tight text-ink">{IDLE_HOSTING.value}</p>
        <p className="text-[13px] leading-5 text-ink-muted">{IDLE_HOSTING.label}</p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Testing */

function Testing() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TESTING.map((t) => (
          <StatTile key={t.label} value={t.value} label={t.label} />
        ))}
      </div>
      <Callout icon={<CircleCheck className="h-3.5 w-3.5" aria-hidden />}>{TESTING_NOTE}</Callout>
    </div>
  );
}

/* ------------------------------------------------------------ Deployment */

const DEPLOY_ICONS: LucideIcon[] = [Monitor, Server, Database, Zap, GitBranch, Boxes];

function Deployment() {
  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {DEPLOYMENT.map((d, i) => {
        const Icon = DEPLOY_ICONS[i % DEPLOY_ICONS.length]!;
        return (
          <Card key={d.name} lift>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-3/70 text-ink-muted ring-1 ring-inset ring-line/70">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold text-ink">{d.name}</h3>
            </div>
            <p className="mt-2.5 text-[13px] leading-5 text-ink-muted">{d.detail}</p>
          </Card>
        );
      })}
    </Stagger>
  );
}

/* ------------------------------------------------------------- Decisions */

function IdChip({ id }: { id: string }) {
  return (
    <span className="num inline-flex h-6 min-w-[2.75rem] shrink-0 items-center justify-center rounded-md bg-surface-3/70 px-1.5 font-mono text-2xs font-semibold text-ink ring-1 ring-inset ring-line">
      {id}
    </span>
  );
}

function Decisions() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="glass overflow-hidden">
        <h3 className="border-b border-line/60 px-4 py-3 text-sm font-semibold text-ink sm:px-5">Decisions</h3>
        <ul>
          {DECISIONS.map((d) => (
            <li key={d.id} className="flex items-start gap-3 border-b border-line/50 px-4 py-3 last:border-b-0 sm:px-5">
              <IdChip id={d.id} />
              <p className="min-w-0 flex-1 text-[13px] leading-6 text-ink">{d.text}</p>
              <Pill tone="violet" className="mt-0.5 hidden sm:inline-flex">VETOABLE</Pill>
            </li>
          ))}
        </ul>
        <p className="border-t border-line/60 bg-surface-2/40 px-4 py-2.5 text-xs text-ink-muted sm:px-5">
          <Pill tone="violet" className="mr-2 sm:hidden">VETOABLE</Pill>
          {DECISIONS_NOTE}
        </p>
      </div>
      <div className="glass self-start overflow-hidden">
        <h3 className="border-b border-line/60 px-4 py-3 text-sm font-semibold text-ink sm:px-5">Open questions</h3>
        <ul>
          {OPEN_QUESTIONS.map((q) => (
            <li key={q.id} className="flex items-start gap-3 border-b border-line/50 px-4 py-3 last:border-b-0 sm:px-5">
              <IdChip id={q.id} />
              <p className="min-w-0 flex-1 text-[13px] leading-6 text-ink">{q.text}</p>
              <Pill tone="warn" className="mt-0.5">open</Pill>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Nugen */

function NugenNotes() {
  return (
    <Stagger className="grid gap-3 md:grid-cols-2">
      {NUGEN_NOTES.map((n) => (
        <Card key={n.title} lift>
          <h3 className="text-sm font-semibold text-ink">{n.title}</h3>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{n.body}</p>
        </Card>
      ))}
    </Stagger>
  );
}

/* --------------------------------------------------------------- Closing */

function Closing() {
  return (
    <div className="glass relative mt-16 overflow-hidden px-5 py-8 text-center sm:px-10 sm:py-10">
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-accent/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-violet/20 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="text-lg font-semibold tracking-tight text-ink sm:text-xl">{HERO.title}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-muted">{HERO.subtitle}</p>
        <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
          <Link to={LINKS.compare} className={linkBtn.primary}>
            Open Compare
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <External href={LINKS.github} className={linkBtn.secondary}>
            <GitHubMark className="h-4 w-4" />
            View GitHub
          </External>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Page */

export function ReviewPage() {
  const nav = useSectionNav(SECTIONS);
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_11.5rem] xl:gap-10">
      <div className="min-w-0">
        <Hero />
        <SectionChipBar items={SECTIONS} {...nav} />
        <div className="space-y-16 sm:space-y-20">
          <Section id="overview" index={index('overview')} title={title('overview')}>
            <Overview />
          </Section>
          <Section id="architecture" index={index('architecture')} title={title('architecture')}>
            <Architecture />
          </Section>
          <Section id="pipeline" index={index('pipeline')} title={title('pipeline')}>
            <Pipeline />
          </Section>
          <Section id="inference" index={index('inference')} title={title('inference')}>
            <Inference />
          </Section>
          <Section id="results" index={index('results')} title={title('results')}>
            <Results />
          </Section>
          <Section id="feedback" index={index('feedback')} title={title('feedback')}>
            <Feedback />
          </Section>
          <Section id="rag-vs-alignment" index={index('rag-vs-alignment')} title={title('rag-vs-alignment')}>
            <RagVsAlignment />
          </Section>
          <Section id="safety" index={index('safety')} title={title('safety')}>
            <Safety />
          </Section>
          <Section id="cost" index={index('cost')} title={title('cost')}>
            <Cost />
          </Section>
          <Section id="testing" index={index('testing')} title={title('testing')}>
            <Testing />
          </Section>
          <Section id="deployment" index={index('deployment')} title={title('deployment')}>
            <Deployment />
          </Section>
          <Section id="decisions" index={index('decisions')} title={title('decisions')}>
            <Decisions />
          </Section>
          <Section id="nugen-notes" index={index('nugen-notes')} title={title('nugen-notes')}>
            <NugenNotes />
          </Section>
        </div>
        <Closing />
      </div>
      <aside className="hidden xl:block">
        <SectionRail items={SECTIONS} {...nav} />
      </aside>
    </div>
  );
}
