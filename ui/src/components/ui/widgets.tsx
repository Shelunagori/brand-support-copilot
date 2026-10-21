import clsx from 'clsx';
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { confidenceLevel } from '../../lib/format';

/* ------------------------------------------------------- AnimatedNumber */

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const fromRef = useRef(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const controls = animate(fromRef.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span className={clsx('num', className)} aria-label={format(value)}>
      <span aria-hidden>{format(display)}</span>
    </span>
  );
}

/* ------------------------------------------------------ ConfidenceBar */

export function ConfidenceBar({ value, live, className }: { value: number | null; live?: boolean; className?: string }) {
  const v = value == null ? null : Math.max(0, Math.min(1, value));
  const level = v == null ? null : confidenceLevel(v);
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-label="Model confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v == null ? undefined : Math.round(v * 100)}
      >
        {v == null ? (
          <div className="skeleton absolute inset-0 rounded-full" />
        ) : (
          <motion.div
            className={clsx(
              'absolute inset-y-0 left-0 rounded-full',
              level === 'high' && 'bg-gradient-to-r from-accent/70 to-accent',
              level === 'mid' && 'bg-gradient-to-r from-warn/70 to-warn',
              level === 'low' && 'bg-gradient-to-r from-danger/70 to-danger',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${v * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        )}
      </div>
      <span
        className={clsx(
          'num w-10 text-right text-xs font-medium',
          level === 'high' && 'text-accent-text',
          level === 'mid' && 'text-warn',
          level === 'low' && 'text-danger',
          level == null && 'text-ink-subtle',
        )}
      >
        {v == null ? '—' : `${Math.round(v * 100)}%`}
        {live && <span className="sr-only"> (provisional)</span>}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------- CopyButton */

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          },
          () => undefined,
        );
      }}
      className={clsx(
        'inline-grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-3/80 hover:text-ink',
        className,
      )}
      aria-label={done ? 'Copied' : `${label}: ${text}`}
      title={done ? 'Copied' : label}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={done ? 'ok' : 'copy'}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/* --------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('[data-autofocus], button, textarea, input');
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const els = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!els.length) return;
        const first = els[0]!;
        const last = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-end p-0 sm:place-items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-bg-deep/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="glass relative w-full max-w-md rounded-b-none bg-surface p-5 shadow-lift sm:rounded-2xl sm:p-6"
            style={{ background: 'rgb(var(--surface) / 0.96)' }}
          >
            <div className="mb-3 flex items-start gap-3">
              {icon && (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn/10 text-warn ring-1 ring-inset ring-warn/30">
                  {icon}
                </span>
              )}
              <h2 id={titleId} className="flex-1 pt-2 text-base font-semibold text-ink">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-ink-subtle hover:bg-surface-3/70 hover:text-ink"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-sm text-ink-muted">{children}</div>
            {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------- Segmented */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx('relative inline-flex rounded-xl bg-surface-3/60 p-0.5 ring-1 ring-inset ring-line/80', className)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const n = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
        if (n) onChange(n.value);
        const btn = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-value="${n?.value}"]`);
        btn?.focus();
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative z-10 inline-flex items-center gap-1.5 rounded-[10px] font-medium transition-colors',
              size === 'md' ? 'h-8 px-3 text-[13px]' : 'h-7 px-2.5 text-xs',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-[10px] bg-surface shadow-glass ring-1 ring-inset ring-line"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Progress */

export function Progress({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'warn' | 'danger'; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className="relative h-2 overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <motion.div
        className={clsx(
          'absolute inset-y-0 left-0 rounded-full',
          tone === 'accent' && 'bg-gradient-to-r from-violet to-accent',
          tone === 'warn' && 'bg-gradient-to-r from-warn/70 to-warn',
          tone === 'danger' && 'bg-gradient-to-r from-danger/70 to-danger',
        )}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(v * 100, v > 0 ? 1.5 : 0)}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
      />
    </div>
  );
}

export function CodeLine({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-xl border border-line bg-bg-deep/60 py-1.5 pl-3 pr-1.5 font-mono text-[13px] text-ink',
        className,
      )}
    >
      <span className="select-none text-accent-text" aria-hidden>
        $
      </span>
      <code className="min-w-0 flex-1 truncate">{children}</code>
      <CopyButton text={children} label="Copy command" />
    </div>
  );
}
