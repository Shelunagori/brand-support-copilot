import type { PipelineRun, RunEvent, RunState } from './types';

export type StageStatus = 'pending' | 'active' | 'done' | 'failed' | 'waiting';
export type StageKey = 'upload' | 'benchmark' | 'align' | 'poll' | 'deploy';

export interface Stage {
  key: StageKey;
  label: string;
  status: StageStatus;
  /** seconds; null when unknown */
  seconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  note?: string;
}

const ORDER: RunState[] = [
  'CREATED',
  'DOCS_UPLOADED',
  'DOCS_READY',
  'BENCHMARK_READY',
  'ALIGNMENT_STARTED',
  'ALIGNED',
  'DEPLOYING',
  'DEPLOYED',
];

export const TERMINAL: RunState[] = ['DEPLOYED', 'FAILED'];

export function isAwaitingConfirmation(run: PipelineRun): boolean {
  const last = [...run.events].reverse().find((e) => e.step === 'alignment_started');
  return run.state === 'BENCHMARK_READY' && last?.status === 'awaiting_confirmation';
}

/** A run that will not move without user action (poll can slow down). */
export function isSettled(run: PipelineRun): boolean {
  return TERMINAL.includes(run.state) || isAwaitingConfirmation(run) || (run.state === 'ALIGNED' && !hasStep(run, 'deploy'));
}

const hasStep = (run: PipelineRun, step: string) => run.events.some((e) => e.step === step);
const lastOf = (events: RunEvent[], step: string, status?: string) =>
  [...events].reverse().find((e) => e.step === step && (status === undefined || e.status === status));
const firstOf = (events: RunEvent[], step: string) => events.find((e) => e.step === step);

function secs(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 1000;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

function detailSeconds(e: RunEvent | undefined): number | null {
  const v = e?.detail?.seconds;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function deriveStages(run: PipelineRun, now = Date.now()): Stage[] {
  const ev = run.events;
  const rank = run.state === 'FAILED' ? -1 : ORDER.indexOf(run.state);
  const nowIso = new Date(now).toISOString();

  const created = firstOf(ev, 'created');
  const uploaded = lastOf(ev, 'upload_docs');
  const docsReady = lastOf(ev, 'docs_ready');
  const bench = lastOf(ev, 'benchmark');
  const alignStarted = lastOf(ev, 'alignment_started', 'ok');
  const awaiting = isAwaitingConfirmation(run);
  const polls = ev.filter((e) => e.step === 'alignment_poll');
  const aligned = lastOf(ev, 'aligned');
  const deploy = firstOf(ev, 'deploy');
  const deployed = lastOf(ev, 'deployed');

  const doneByEvents: Record<StageKey, boolean> = {
    upload: !!docsReady || rank >= ORDER.indexOf('DOCS_READY'),
    benchmark: !!bench || rank >= ORDER.indexOf('BENCHMARK_READY'),
    align: !!alignStarted || rank >= ORDER.indexOf('ALIGNMENT_STARTED'),
    poll: !!aligned || rank >= ORDER.indexOf('ALIGNED'),
    deploy: !!deployed || run.state === 'DEPLOYED',
  };

  const startEnd: Record<StageKey, [string | null, string | null, RunEvent | undefined]> = {
    upload: [created?.at ?? run.created_at, docsReady?.at ?? uploaded?.at ?? null, docsReady ?? uploaded],
    benchmark: [docsReady?.at ?? null, bench?.at ?? null, bench],
    align: [bench?.at ?? null, alignStarted?.at ?? null, alignStarted],
    poll: [alignStarted?.at ?? null, aligned?.at ?? null, aligned],
    deploy: [deploy?.at ?? aligned?.at ?? null, deployed?.at ?? null, deployed],
  };

  const labels: Record<StageKey, string> = {
    upload: 'Upload',
    benchmark: 'Benchmark',
    align: 'Align',
    poll: 'Poll',
    deploy: 'Deploy',
  };

  const keys: StageKey[] = ['upload', 'benchmark', 'align', 'poll', 'deploy'];
  const firstOpen = keys.find((k) => !doneByEvents[k]);
  const failed = run.state === 'FAILED';

  return keys.map((key) => {
    const [start, end, endEvent] = startEnd[key];
    let status: StageStatus = 'pending';
    if (doneByEvents[key]) status = 'done';
    else if (key === firstOpen) {
      if (failed) status = 'failed';
      else if (key === 'align' && awaiting) status = 'waiting';
      else if (key === 'deploy' && run.state === 'ALIGNED' && !deploy) status = 'waiting';
      else status = 'active';
    }

    let seconds: number | null = null;
    if (status === 'done') seconds = detailSeconds(endEvent) ?? secs(start, end);
    else if (status === 'active') seconds = secs(start, nowIso);

    let note: string | undefined;
    if (key === 'upload') {
      const n = run.document_ids?.length ?? run.document_names?.length;
      if (n) note = `${n} document${n === 1 ? '' : 's'}`;
    }
    if (key === 'align' && status === 'waiting') note = 'Awaiting confirmation (uses credits)';
    if (key === 'poll') {
      const st = run.alignment_status ?? polls[polls.length - 1]?.status;
      if (st) note = st;
    }
    if (key === 'deploy') {
      if (status === 'waiting') note = 'Ready to deploy';
      else if (run.deployment_status) note = run.deployment_status;
    }
    if (status === 'failed' && run.last_error) note = run.last_error;

    return { key, label: labels[key], status, seconds, startedAt: start, endedAt: end, note };
  });
}

/** Distinct status transitions seen while polling the alignment job. */
export function pollTransitions(run: PipelineRun): { status: string; at: string }[] {
  const out: { status: string; at: string }[] = [];
  for (const e of run.events) {
    if (e.step !== 'alignment_poll') continue;
    if (out[out.length - 1]?.status !== e.status) out.push({ status: e.status, at: e.at });
  }
  return out;
}
