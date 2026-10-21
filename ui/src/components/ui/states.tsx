import clsx from 'clsx';
import { motion } from 'framer-motion';
import { KeyRound, RefreshCw, ServerOff, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApiError } from '../../lib/api';
import { Button } from './primitives';

function Halo({ children, tone }: { children: ReactNode; tone: 'neutral' | 'danger' | 'accent' }) {
  return (
    <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center">
      <div
        className={clsx(
          'absolute inset-0 rounded-2xl blur-xl',
          tone === 'danger' && 'bg-danger/25',
          tone === 'accent' && 'bg-accent/20',
          tone === 'neutral' && 'bg-violet/20',
        )}
      />
      <div
        className={clsx(
          'relative grid h-14 w-14 place-items-center rounded-2xl ring-1 ring-inset',
          'bg-gradient-to-b from-surface-2 to-surface shadow-glass',
          tone === 'danger' ? 'text-danger ring-danger/30' : tone === 'accent' ? 'text-accent-text ring-accent/30' : 'text-violet-text ring-line',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  compact,
}: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('mx-auto flex max-w-md flex-col items-center text-center', compact ? 'py-6' : 'py-12', className)}
    >
      <Halo tone="neutral">{icon}</Halo>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body && <div className="mt-1.5 text-sm text-ink-muted">{body}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title,
  className,
  compact,
  inline,
}: {
  error: ApiError;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
  /** One-row variant for secondary cards, so an outage doesn't stack big alerts. */
  inline?: boolean;
}) {
  const auth = error.status === 401 || error.status === 403;
  const offline = error.isNetwork;
  const Icon = auth ? KeyRound : offline ? ServerOff : TriangleAlert;
  const heading = title ?? (offline ? 'API unreachable' : auth ? 'Not authorised' : 'Something went wrong');
  if (inline) {
    return (
      <div
        role="alert"
        className={clsx('flex items-center gap-3 rounded-xl border border-danger/25 bg-danger/[0.04] px-3 py-2.5', className)}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger/10 text-danger">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">{heading}</p>
          <p className="truncate font-mono text-2xs text-ink-subtle" title={error.message}>
            {error.status ? `HTTP ${error.status}` : 'network'} · {error.path || 'request'}
          </p>
        </div>
        {onRetry && (
          <Button size="sm" variant="ghost" onClick={onRetry} aria-label={`Retry ${error.path}`} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('mx-auto flex max-w-md flex-col items-center text-center', compact ? 'py-6' : 'py-12', className)}
    >
      <Halo tone="danger">
        <Icon className="h-6 w-6" aria-hidden />
      </Halo>
      <h3 className="text-[15px] font-semibold text-ink">
        {heading}
      </h3>
      <p className="mt-1.5 text-sm text-ink-muted">{error.message}</p>
      <p className="mt-2 font-mono text-2xs text-ink-subtle">
        {error.status ? `HTTP ${error.status}` : 'network'} · {error.path || 'request'}
      </p>
      {onRetry && (
        <Button className="mt-5" size="sm" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
          Try again
        </Button>
      )}
    </motion.div>
  );
}
