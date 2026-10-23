import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import type { Layer } from './content';
import { LAYER_LEGEND } from './content';
import { LAYER_STYLE } from './styles';

export function LayerBadge({ layer, className }: { layer: Layer; className?: string }) {
  const s = LAYER_STYLE[layer];
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset',
        s.bg,
        s.text,
        s.ring,
        className,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.swatch)} aria-hidden />
      {LAYER_LEGEND[layer]}
    </span>
  );
}

export function Legend({ layers, className }: { layers: Layer[]; className?: string }) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <span className="eyebrow">Legend</span>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {layers.map((l) => (
          <li key={l} className="flex items-center gap-2 text-xs text-ink-muted">
            <span className={clsx('h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-black/5', LAYER_STYLE[l].swatch)} aria-hidden />
            {LAYER_LEGEND[l]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- Section */

export function Section({
  id,
  index,
  title,
  children,
  className,
}: {
  id: string;
  index: number;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={clsx('scroll-mt-32 xl:scroll-mt-20', className)}>
      <div className="mb-5 flex items-center gap-3">
        <span className="num grid h-7 min-w-[1.75rem] place-items-center rounded-lg bg-surface/80 px-1.5 font-mono text-2xs font-semibold text-ink-subtle ring-1 ring-inset ring-line">
          {String(index).padStart(2, '0')}
        </span>
        <h2 id={`${id}-title`} tabIndex={-1} className="text-lg font-semibold tracking-tight text-ink outline-none sm:text-xl">
          {title}
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" aria-hidden />
      </div>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- Callout */

type CalloutTone = 'note' | 'warn';

export function Callout({
  tone = 'note',
  title,
  children,
  icon,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const Icon = tone === 'warn' ? TriangleAlert : Info;
  return (
    <div
      role="note"
      className={clsx(
        'relative overflow-hidden rounded-2xl border px-4 py-3.5 sm:px-5',
        tone === 'warn' ? 'border-warn/35 bg-warn/[0.07]' : 'border-violet/25 bg-violet/[0.06]',
        className,
      )}
    >
      <span
        className={clsx('absolute inset-y-0 left-0 w-[3px]', tone === 'warn' ? 'bg-warn' : 'bg-violet')}
        aria-hidden
      />
      <div className="flex gap-3">
        <span
          className={clsx(
            'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
            tone === 'warn' ? 'bg-warn/10 text-warn ring-warn/30' : 'bg-violet/10 text-violet-text ring-violet/30',
          )}
        >
          {icon ?? <Icon className="h-3.5 w-3.5" aria-hidden />}
        </span>
        <div className="min-w-0 text-sm leading-6">
          {title && <p className="font-semibold text-ink">{title}</p>}
          <div className={clsx('text-ink-muted', title && 'mt-0.5')}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Stat tile */

export function StatTile({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <div className={clsx('glass flex flex-col gap-1.5 p-4 sm:p-5', className)}>
      <p className="num bg-gradient-to-br from-ink to-ink-muted bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-[1.75rem]">
        {value}
      </p>
      <p className="text-[13px] leading-5 text-ink-muted">{label}</p>
    </div>
  );
}

/* ----------------------------------------------------------- Numbered flow */

/** Horizontal numbered flow on large screens, vertical timeline below. */
export function NumberedFlow({ steps, cols }: { steps: { step: string; detail: string }[]; cols: 4 | 5 }) {
  return (
    <ol className={clsx('relative grid gap-3', cols === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
      {steps.map((s, i) => (
        <li key={s.step} className="relative flex gap-3 lg:flex-col">
          {/* connector: vertical below lg, horizontal from lg */}
          {i < steps.length - 1 && (
            <>
              <span
                className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b from-accent/50 to-line lg:hidden"
                aria-hidden
              />
              <span
                className="absolute left-10 right-[-0.75rem] top-4 hidden h-px bg-gradient-to-r from-accent/50 to-line lg:block"
                aria-hidden
              />
            </>
          )}
          <span className="num relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-b from-surface-2 to-surface font-mono text-xs font-semibold text-accent-text shadow-glass ring-1 ring-inset ring-accent/40">
            {i + 1}
          </span>
          <div className="glass min-w-0 flex-1 p-3.5 lg:mt-3">
            <p className="text-sm font-semibold text-ink">{s.step}</p>
            <p className="mt-1 break-words text-[13px] leading-5 text-ink-muted">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------- Misc */

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

