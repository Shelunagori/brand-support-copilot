import type { Layer } from './content';

/* Layer colours, shared by the architecture diagram, the inference flow and the legend. */
export const LAYER_STYLE: Record<
  Layer,
  { text: string; ring: string; bg: string; swatch: string; bar: string; glow: string }
> = {
  client: {
    text: 'text-ink-muted',
    ring: 'ring-line-strong/70',
    bg: 'bg-surface-3/60',
    swatch: 'bg-ink-subtle',
    bar: 'from-ink-subtle/70 to-ink-subtle/10',
    glow: 'bg-ink-subtle/10',
  },
  deterministic: {
    text: 'text-accent-text',
    ring: 'ring-accent/35',
    bg: 'bg-accent/10',
    swatch: 'bg-accent',
    bar: 'from-accent to-accent/10',
    glow: 'bg-accent/15',
  },
  model: {
    text: 'text-violet-text',
    ring: 'ring-violet/35',
    bg: 'bg-violet/10',
    swatch: 'bg-violet',
    bar: 'from-violet to-violet/10',
    glow: 'bg-violet/15',
  },
  data: {
    text: 'text-info-text',
    ring: 'ring-info/35',
    bg: 'bg-info/10',
    swatch: 'bg-info',
    bar: 'from-info to-info/10',
    glow: 'bg-info/15',
  },
};

export const linkBtn = {
  primary:
    'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_6px_20px_-8px_rgb(var(--accent)/0.6)] transition-all hover:shadow-glow hover:brightness-110',
  secondary:
    'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line bg-surface/80 px-4 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2',
  ghost:
    'inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-3/60 hover:text-ink',
};

export const thClass = 'whitespace-nowrap px-3 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-subtle';
export const tdClass = 'px-3 py-2.5 align-top';
