import clsx from 'clsx';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { LoaderCircle } from 'lucide-react';
import { cardVariants, stagger } from '../../lib/motion';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

/* ----------------------------------------------------------------- Card */

type CardProps = HTMLMotionProps<'div'> & { lift?: boolean; pad?: boolean };

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, lift = false, pad = true, children, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      variants={cardVariants}
      whileHover={lift ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={clsx('glass', pad && 'p-4 sm:p-5', lift && 'transition-shadow hover:shadow-lift', className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

/** Wrapper that staggers its Card children into view. */
export function Stagger({ className, children, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className} {...rest}>
      {children}
    </motion.div>
  );
}

export function CardHeader({
  title,
  eyebrow,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3/70 text-ink-muted ring-1 ring-line/70">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
        variant === 'primary' &&
          'bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_6px_20px_-8px_rgb(var(--accent)/0.6)] hover:brightness-110 enabled:hover:shadow-glow',
        variant === 'secondary' &&
          'border border-line bg-surface/80 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] hover:border-line-strong hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-muted hover:bg-surface-3/60 hover:text-ink',
        variant === 'danger' && 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/15',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* ----------------------------------------------------------------- Pill */

export type Tone = 'neutral' | 'accent' | 'violet' | 'success' | 'warn' | 'danger';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-3/70 text-ink-muted ring-line/80',
  accent: 'bg-accent/10 text-accent-text ring-accent/30',
  violet: 'bg-violet/10 text-violet-text ring-violet/30',
  success: 'bg-success/10 text-success ring-success/30',
  warn: 'bg-warn/10 text-warn ring-warn/30',
  danger: 'bg-danger/10 text-danger ring-danger/30',
};

export function Pill({
  tone = 'neutral',
  mono,
  icon,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; mono?: boolean; icon?: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset',
        mono && 'font-mono tracking-tight',
        toneClass[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('skeleton', className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={clsx('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Kbd/etc */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
      {children}
    </kbd>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet/25 to-accent/15 text-accent-text ring-1 ring-inset ring-line sm:grid">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={clsx('animate-spin', className)} />;
}
