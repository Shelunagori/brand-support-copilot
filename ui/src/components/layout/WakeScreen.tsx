import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, RefreshCw, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { serverStatus, useServerStatus } from '../../lib/serverStatus';
import { Button } from '../ui/primitives';
import { LogoMark } from './Shell';

export const WAKE_HEADLINE = 'Waking up the server… ☕';

/** Full-screen state for the live routes while the free-tier API spins up. */
export function WakeScreen() {
  const { elapsedMs, slow } = useServerStatus();
  const reduce = useReducedMotion();
  const secs = Math.floor(elapsedMs / 1000);
  // Reduced motion: a static bar that fills over ~60 s instead of the sweeping shimmer.
  const staticFill = Math.min(0.95, Math.max(0.04, elapsedMs / 60_000));

  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-10">
      <div className="bg-stage" aria-hidden />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="glass w-full max-w-md px-6 pb-6 pt-9 text-center shadow-lift sm:px-9"
        aria-labelledby="wake-title"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 left-1/2 h-40 w-80 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet/25 via-accent/15 to-violet/10 blur-3xl"
        />

        {/* logo mark with pulse rings */}
        <div className="relative mx-auto mb-6 grid h-16 w-16 place-items-center" aria-hidden>
          <span className="wake-ring absolute inset-0 rounded-[1.1rem] ring-2 ring-accent/50" />
          <span className="wake-ring wake-ring-delayed absolute inset-0 rounded-[1.1rem] ring-2 ring-violet/40" />
          <span className="absolute inset-1 rounded-2xl bg-accent/15 blur-xl" />
          <LogoMark className="relative h-14 w-14 drop-shadow-sm" />
        </div>

        <div role="status" aria-live="polite">
          <h1 id="wake-title" className="text-xl font-semibold tracking-tight text-ink">
            {WAKE_HEADLINE}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-ink-muted">
            Free-tier servers sleep when idle. This can take up to a minute.
          </p>
          {slow && (
            <p
              className="fade-up mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-3 py-1 text-[13px] font-medium text-warn ring-1 ring-inset ring-warn/30"
            >
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              Still waking up, retrying…
            </p>
          )}
        </div>

        {/* progress */}
        <div className="mt-7">
          <div
            className="relative h-1.5 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Waking the server"
            aria-valuetext={`${secs} seconds elapsed`}
          >
            {reduce ? (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet to-accent"
                style={{ width: `${staticFill * 100}%` }}
              />
            ) : (
              <div className="indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-violet/0 via-violet to-accent" />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-2xs text-ink-subtle">
            <span>Pinging /health every 3 s</span>
            <span aria-hidden>
              <span className="num font-medium text-ink-muted">{secs}</span> s elapsed
            </span>
          </div>
        </div>

        <div className="mt-7 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          {slow && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => serverStatus.retry()}
              icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            >
              Retry
            </Button>
          )}
          <Link
            to="/eval"
            className="group inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent/10"
          >
            Browse saved results meanwhile
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </motion.main>
    </div>
  );
}
