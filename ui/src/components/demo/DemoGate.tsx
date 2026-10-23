import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Globe, Hourglass, LockKeyhole, PiggyBank, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, DEMO_DISABLED_MESSAGE } from '../../lib/api';
import { limitReason, useIsDemo } from '../../lib/demo';
import { setDemoCode } from '../../lib/demoCode';
import type { DemoStatus } from '../../lib/types';
import { Button } from '../ui/primitives';

const money = (v: number) => `$${v.toFixed(2)}`;

/* ------------------------------------------------------------ budget bar */

export function BudgetBar({ status, className }: { status: DemoStatus | null; className?: string }) {
  const cap = status?.daily_cap_usd;
  const spent = status?.spent_today_usd;
  if (cap == null || spent == null || cap <= 0) return null;
  const v = Math.max(0, Math.min(1, spent / cap));
  const tone = v >= 1 ? 'danger' : v >= 0.75 ? 'warn' : 'accent';
  return (
    <div className={clsx('text-left', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-muted">
          Today&apos;s demo budget:{' '}
          <span className="num font-medium text-ink">
            {money(spent)} of {money(cap)}
          </span>{' '}
          used
        </span>
        <span className="num text-ink-subtle">{Math.round(v * 100)}%</span>
      </div>
      <div
        className="relative h-1 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Today's demo budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
      >
        <div
          className={clsx(
            'absolute inset-y-0 left-0 rounded-full',
            tone === 'accent' && 'bg-gradient-to-r from-violet to-accent',
            tone === 'warn' && 'bg-gradient-to-r from-warn/70 to-warn',
            tone === 'danger' && 'bg-gradient-to-r from-danger/70 to-danger',
          )}
          style={{ width: `${Math.max(v * 100, v > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ shared bits */

function IconHalo({ children, tone }: { children: ReactNode; tone: 'accent' | 'warn' }) {
  return (
    <div className="relative mx-auto mb-5 grid h-16 w-16 place-items-center">
      <div className={clsx('absolute inset-0 rounded-2xl blur-xl', tone === 'accent' ? 'bg-accent/20' : 'bg-warn/20')} />
      <div
        className={clsx(
          'relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-surface-2 to-surface shadow-glass ring-1 ring-inset',
          tone === 'accent' ? 'text-accent-text ring-accent/30' : 'text-warn ring-warn/30',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function BrowseLinks() {
  return (
    <p className="mt-6 border-t border-line/60 pt-4 text-[13px] text-ink-muted">
      Meanwhile, the saved results are open to everyone:{' '}
      <span className="mt-2 flex flex-wrap justify-center gap-1.5">
        {[
          { to: '/eval', label: 'Eval Dashboard' },
          { to: '/pipeline', label: 'Pipeline' },
          { to: '/feedback', label: 'Feedback Loop' },
        ].map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="group inline-flex items-center gap-1 rounded-full border border-line/80 bg-surface/70 px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
          >
            {l.label}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ))}
      </span>
    </p>
  );
}

/* ------------------------------------------------------------ access gate */

export function AccessGate({ status }: { status: DemoStatus | null }) {
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errId = useId();

  const submit = async () => {
    const v = code.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.demoVerify(v);
      setDemoCode(v);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError(
        err?.status === 401
          ? "That code didn't work. Check it and try again."
          : err?.status === 429
            ? 'Too many attempts. Wait a while before trying again.'
            : err?.status === 0
              ? 'Could not reach the server. Try again in a moment.'
              : (err?.message ?? 'Could not check the code.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass relative mx-auto max-w-md overflow-hidden px-5 pb-6 pt-8 text-center sm:px-8"
      aria-labelledby={`${inputId}-title`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-40 w-80 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet/25 via-accent/15 to-violet/10 blur-3xl"
      />
      <IconHalo tone="accent">
        <LockKeyhole className="h-6 w-6" aria-hidden />
      </IconHalo>
      <h2 id={`${inputId}-title`} className="relative text-lg font-semibold tracking-tight text-ink">
        Enter the demo access code
      </h2>
      <p className="relative mx-auto mt-1.5 max-w-sm text-balance text-sm leading-6 text-ink-muted">
        Live chat uses real model credits, so it&apos;s behind an access code. Ask the person who shared this link for the code.
      </p>

      <form
        className="relative mt-6 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-ink-muted">
          Access code
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id={inputId}
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? errId : undefined}
              placeholder="••••••••"
              className={clsx('input h-10 pr-10 font-mono tracking-wide', error && '!border-danger/60 focus:!ring-danger/25')}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide code' : 'Show code'}
              aria-pressed={show}
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-3/70 hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <Button type="submit" variant="primary" loading={busy} disabled={!code.trim()}>
            Unlock
          </Button>
        </div>
        {error && (
          <p id={errId} role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] text-danger">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </form>

      <BudgetBar status={status} className="relative mt-6" />
      <BrowseLinks />
    </motion.section>
  );
}

/* ------------------------------------------------------------ limit state */

function untilUtcMidnight(now = Date.now()): string {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  const mins = Math.max(1, Math.round((next - now) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

export function DemoLimitCard({ status }: { status: DemoStatus | null }) {
  const total = limitReason(status) === 'total';
  const [, force] = useState(0);
  useEffect(() => {
    if (total) return;
    const t = setTimeout(() => force((n) => n + 1), 60_000);
    return () => clearTimeout(t);
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass relative mx-auto max-w-md overflow-hidden px-5 pb-6 pt-8 text-center sm:px-8"
      role="status"
    >
      <IconHalo tone="warn">
        {total ? <PiggyBank className="h-6 w-6" aria-hidden /> : <Hourglass className="h-6 w-6" aria-hidden />}
      </IconHalo>
      <h2 className="text-lg font-semibold tracking-tight text-ink">
        {total ? "The demo's total budget has been used" : 'Demo limit reached for today'}
      </h2>
      {total ? (
        <p className="mx-auto mt-1.5 max-w-sm text-balance text-sm leading-6 text-ink-muted">
          Live chat is paused to protect the model credits. Eval, Pipeline and Feedback results are still available.
        </p>
      ) : (
        <>
          <p className="mx-auto mt-1.5 max-w-sm text-balance text-sm leading-6 text-ink-muted">
            A daily spend cap protects the model credits behind this demo, and today&apos;s share is used up. It resets at{' '}
            <span className="whitespace-nowrap font-medium text-ink">00:00 UTC</span>.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-3/70 px-3 py-1 text-xs text-ink-muted ring-1 ring-inset ring-line">
            Resets in <span className="num font-medium text-ink">{untilUtcMidnight()}</span>
          </p>
          <BudgetBar status={status} className="mt-6" />
        </>
      )}
      <BrowseLinks />
    </motion.section>
  );
}

/* ------------------------------------------------------- disabled controls */

/**
 * Wraps a control that is disabled in the public demo, so the reason shows as a tooltip even
 * though disabled buttons don't receive pointer events. Pass `disabled` + `aria-description`
 * to the child yourself (see demoDisabledProps).
 */
export function DemoLock({ active, children }: { active: boolean; children: ReactElement }) {
  if (!active) return children;
  return (
    <span className="inline-flex cursor-not-allowed" title={DEMO_DISABLED_MESSAGE}>
      {children}
    </span>
  );
}

/** Header indicator: the deployment is the public demo. */
export function DemoModePill() {
  const demo = useIsDemo();
  if (!demo) return null;
  return (
    <div
      className="flex h-8 items-center gap-1.5 rounded-full border border-violet/30 bg-violet/10 px-2.5 text-xs font-medium text-violet-text"
      title="Paid and state-changing actions are disabled. Live chat needs an access code."
      aria-label="Public demo, read-only"
      role="note"
    >
      <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="hidden whitespace-nowrap lg:inline">Public demo · read-only</span>
      <span className="whitespace-nowrap lg:hidden">Demo</span>
    </div>
  );
}
