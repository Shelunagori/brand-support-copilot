import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Braces,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  Hash,
  Info,
  LifeBuoy,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, DEMO_DISABLED_MESSAGE } from '../../lib/api';
import { useIsDemo } from '../../lib/demo';
import { POLICY_REF_RE, humanize, int, ms } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { SupportResponse } from '../../lib/types';
import type { StreamState } from '../../lib/useStream';
import { Button, Pill, SkeletonText } from '../ui/primitives';
import { ConfidenceBar, CopyButton } from '../ui/widgets';
import { LogoMark } from '../layout/Shell';

/** Smoothly reveal `text` (which only ever grows while streaming) for a typing effect. */
function useTypewriter(text: string, active: boolean): string {
  const reduce = useReducedMotion();
  const [n, setN] = useState(active ? 0 : text.length);
  const target = useRef(text.length);
  target.current = text.length;

  useEffect(() => {
    if (reduce) {
      setN(text.length);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setN((cur) => {
        if (cur > target.current) return target.current; // text was replaced (repair)
        const behind = target.current - cur;
        if (behind <= 0) return cur;
        // ~90 chars/s baseline, accelerating when far behind so we never lag much.
        const speed = 0.09 + behind / 600;
        return Math.min(target.current, cur + Math.max(1, Math.round(speed * dt)));
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduce, text.length]);

  return text.slice(0, Math.min(n, text.length));
}

function Feedback({ inferenceId }: { inferenceId: string | null }) {
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'up' | 'down-open' | 'down'>('idle');
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState('');
  const [comment, setComment] = useState('');
  const demo = useIsDemo();
  const disabled = !inferenceId || demo;
  const reason = demo ? DEMO_DISABLED_MESSAGE : !inferenceId ? 'No inference id for this reply (cached or fallback)' : undefined;

  const send = async (rating: 'up' | 'down') => {
    if (!inferenceId) return;
    setBusy(true);
    try {
      const r = await api.feedback({
        inference_id: inferenceId,
        rating,
        correction: rating === 'down' && correction.trim() ? correction.trim() : undefined,
        comment: rating === 'down' && comment.trim() ? comment.trim() : undefined,
      });
      setState(rating);
      toast({
        tone: 'success',
        title: rating === 'up' ? 'Thanks — marked helpful' : 'Correction saved',
        body: r.flagged ? 'Flagged for the re-alignment dataset.' : undefined,
      });
    } catch (e) {
      toast({ tone: 'error', title: 'Feedback not saved', body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="contents">
      <div className={clsx('ml-auto flex items-center gap-1', disabled && 'cursor-not-allowed')} title={reason}>
        <button
          type="button"
          disabled={disabled || busy || state === 'up' || state === 'down'}
          onClick={() => void send('up')}
          aria-pressed={state === 'up'}
          aria-description={demo ? DEMO_DISABLED_MESSAGE : undefined}
          aria-label="Helpful"
          className={clsx(
            'grid h-7 w-7 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed',
            state === 'up' ? 'bg-success/15 text-success' : 'text-ink-subtle enabled:hover:bg-surface-3/70 enabled:hover:text-ink',
            disabled && 'opacity-40',
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || busy || state === 'up' || state === 'down'}
          onClick={() => setState((s) => (s === 'down-open' ? 'idle' : 'down-open'))}
          aria-pressed={state === 'down' || state === 'down-open'}
          aria-expanded={state === 'down-open'}
          aria-description={demo ? DEMO_DISABLED_MESSAGE : undefined}
          aria-label="Not helpful — suggest a correction"
          className={clsx(
            'grid h-7 w-7 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed',
            state === 'down' || state === 'down-open'
              ? 'bg-danger/15 text-danger'
              : 'text-ink-subtle enabled:hover:bg-surface-3/70 enabled:hover:text-ink',
            disabled && 'opacity-40',
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {state === 'down-open' && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full basis-full overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              void send('down');
            }}
          >
            <div className="mb-1 mt-1 space-y-2 rounded-xl border border-line bg-surface/80 p-3">
              <label className="block text-xs font-medium text-ink-muted" htmlFor={`corr-${inferenceId}`}>
                What should the copilot have said?
              </label>
              <textarea
                id={`corr-${inferenceId}`}
                className="input min-h-[84px] resize-y"
                placeholder="Write the corrected customer-facing answer…"
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                data-autofocus
              />
              <input
                className="input"
                placeholder="Optional note (e.g. wrong policy, should escalate)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                aria-label="Optional comment"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setState('idle')}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" type="submit" loading={busy}>
                  Submit correction
                </Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ModelBadge({ kind }: { kind: 'aligned' | 'base' }) {
  return (
    <Pill tone={kind === 'aligned' ? 'accent' : 'violet'} className="uppercase tracking-wider">
      {kind}
    </Pill>
  );
}

export function AnswerCard({
  s,
  onRetry,
  showFeedback = true,
  compact,
}: {
  s: StreamState;
  onRetry?: () => void;
  showFeedback?: boolean;
  compact?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const streaming = s.status === 'streaming';
  const shown = useTypewriter(s.text, streaming);
  const typing = streaming || shown.length < s.text.length;
  const f = s.final;
  const policyValid = f?.policy_ref ? POLICY_REF_RE.test(f.policy_ref) : false;

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'glass overflow-hidden',
        f?.escalate_to_human && 'ring-1 ring-danger/30',
      )}
      aria-label={`${s.model} model reply`}
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line/60 px-4 py-3">
        <LogoMark className="h-6 w-6" />
        <span className="text-[13px] font-semibold text-ink">Copilot</span>
        <ModelBadge kind={s.model} />
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {f ? (
            <>
              <Pill tone="neutral">{humanize(f.intent)}</Pill>
              {f.policy_ref ? (
                <Pill
                  mono
                  tone={policyValid ? 'accent' : 'warn'}
                  title={policyValid ? 'Policy reference' : 'Policy reference has unexpected format'}
                >
                  {f.policy_ref}
                </Pill>
              ) : (
                <Pill mono tone="neutral" title="No policy cited">
                  no policy_ref
                </Pill>
              )}
              {f.escalate_to_human && (
                <span className="inline-flex animate-pulse-ring items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-2xs font-semibold text-white dark:text-[rgb(var(--bg-deep))]">
                  <LifeBuoy className="h-3 w-3" aria-hidden />
                  Escalate to human
                </span>
              )}
            </>
          ) : s.status === 'streaming' ? (
            <>
              <span className="skeleton h-5 w-16 rounded-full" />
              <span className="skeleton h-5 w-20 rounded-full" />
            </>
          ) : null}
        </div>
      </div>

      {/* body */}
      <div className={clsx('px-4', compact ? 'py-3' : 'py-4')}>
        {s.status === 'error' && !s.text ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Couldn't get a reply</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">{s.error?.message}</p>
            </div>
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
                Retry
              </Button>
            )}
          </div>
        ) : (
          <div aria-live="polite" aria-busy={streaming} aria-atomic="false">
            {!s.text && streaming ? (
              <div>
                <p className="mb-3 text-xs text-ink-subtle">
                  {s.meta ? 'Thinking with policy context…' : 'Connecting…'}
                </p>
                <SkeletonText lines={3} />
              </div>
            ) : (
              <p className={clsx('whitespace-pre-wrap text-[15px] leading-7 text-ink', typing && 'caret')}>{shown}</p>
            )}
            {f && f.model_kind === 'base' && !f.fallback && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle" data-testid="base-note">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Base model, not aligned; answers may be generic.
              </p>
            )}
          </div>
        )}

        {(s.confidence != null || streaming) && s.status !== 'error' && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="eyebrow">Confidence</span>
              {!f && s.confidence != null && <span className="text-2xs text-ink-subtle">live</span>}
              {f && <ConfidenceSource source={f.confidence_source} />}
            </div>
            <div className={clsx(f?.confidence_source === 'model_reported' && 'opacity-60 saturate-50')}>
              <ConfidenceBar value={s.confidence} live={!f} />
            </div>
          </div>
        )}

        {f && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {f.notice === 'aligned_offline' && (
              <Pill tone="warn" icon={<PowerOff className="h-3 w-3" aria-hidden />} title="Aligned model is undeployed; the base model answered.">
                aligned offline · base answered
              </Pill>
            )}
            {f.cached && (
              <Pill tone="violet" icon={<Database className="h-3 w-3" aria-hidden />}>
                cached
              </Pill>
            )}
            {(f.repaired || s.repaired) && (
              <Pill tone="warn" icon={<Wrench className="h-3 w-3" aria-hidden />}>
                repaired
              </Pill>
            )}
            {f.fallback && (
              <Pill tone="danger" icon={<TriangleAlert className="h-3 w-3" aria-hidden />}>
                fallback
              </Pill>
            )}
            {!f.json_valid_first_try && (
              <Pill tone="warn" icon={<Braces className="h-3 w-3" aria-hidden />}>
                JSON retry
              </Pill>
            )}
            {f.guardrail_triggers.map((g) => (
              <Pill key={g} tone="danger" icon={<ShieldAlert className="h-3 w-3" aria-hidden />}>
                {humanize(g)}
              </Pill>
            ))}
            {!f.fallback && f.guardrail_triggers.length === 0 && f.json_valid_first_try && (
              <Pill tone="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>
                clean
              </Pill>
            )}
          </div>
        )}

        {f?.error && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-xs text-warn">{f.error}</p>
        )}

        {s.raw && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              aria-expanded={showRaw}
              className="inline-flex items-center gap-1 rounded-md text-xs text-ink-subtle hover:text-ink"
            >
              <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', showRaw && 'rotate-180')} aria-hidden />
              Raw model tokens
            </button>
            <AnimatePresence initial={false}>
              {showRaw && (
                <motion.pre
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-line bg-bg-deep/60 p-3 font-mono text-[11.5px] leading-5 text-ink-muted"
                >
                  {s.raw}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/60 bg-surface-2/30 px-4 py-2.5 text-xs text-ink-subtle">
        {f ? (
          <>
            <span className="num inline-flex items-center gap-1.5" title="Latency">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {ms(f.latency_ms)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5" title="Model id">
              <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="max-w-[14rem] truncate font-mono">{f.model_id}</span>
            </span>
            {f.total_tokens > 0 && (
              <span className="num inline-flex items-center gap-1.5" title="Total tokens">
                <Hash className="h-3.5 w-3.5" aria-hidden />
                {int(f.total_tokens)} tok
              </span>
            )}
            {f.request_id && !compact && (
              <span className="hidden items-center gap-0.5 sm:inline-flex" title={`Request ${f.request_id}`}>
                <span className="font-mono">req {f.request_id.slice(0, 8)}</span>
                <CopyButton text={f.request_id} label="Copy request id" />
              </span>
            )}
            {showFeedback && <Feedback inferenceId={f.inference_id} />}
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono">{s.meta?.model_id ?? (streaming ? 'resolving model…' : '—')}</span>
          </span>
        )}
      </div>
    </motion.article>
  );
}

/** Where the confidence number comes from; only Nugen's score is a measured signal. */
function ConfidenceSource({ source }: { source?: SupportResponse['confidence_source'] }) {
  if (source === 'nugen')
    return (
      <span className="text-2xs text-ink-subtle" title="Nugen's inference-time confidence score for aligned models">
        Nugen confidence score
      </span>
    );
  if (source === 'none') return <span className="text-2xs text-ink-subtle">none (fallback)</span>;
  return (
    <span
      className="text-2xs font-medium text-warn"
      title="The number the model wrote in its own JSON. It is not a calibrated probability."
      data-testid="confidence-model-reported"
    >
      model-reported · uncalibrated
    </span>
  );
}
