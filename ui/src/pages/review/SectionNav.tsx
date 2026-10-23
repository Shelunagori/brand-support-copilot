import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { reducedMotion, type NavItem } from './hooks';

type NavProps = { items: readonly NavItem[]; active: string; onNavigate: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void };

/** Below xl: sticky, horizontally scrollable chip bar under the app header. */
export function SectionChipBar({ items, active, onNavigate }: NavProps) {
  const bar = useRef<HTMLDivElement>(null);
  // keep the active chip visible inside the bar (horizontal only, never moves the page)
  useEffect(() => {
    const el = bar.current;
    const chip = el?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!el || !chip || el.offsetParent === null) return;
    const left = chip.offsetLeft - el.clientWidth / 2 + chip.clientWidth / 2;
    el.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  return (
    <nav
      aria-label="Case study sections"
      data-testid="review-chipbar"
      className="sticky top-14 z-30 -mx-4 mb-8 border-b border-line/60 bg-bg/80 backdrop-blur-xl sm:-mx-6 lg:-mx-10 xl:hidden"
    >
      <div ref={bar} className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-6 lg:px-10">
        {items.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            data-id={s.id}
            onClick={(e) => onNavigate(e, s.id)}
            aria-current={active === s.id ? 'location' : undefined}
            className={clsx(
              'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
              active === s.id ? 'bg-accent/10 text-accent-text ring-accent/35' : 'bg-surface/70 text-ink-muted ring-line hover:text-ink',
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** xl+: sticky rail in the page's right column. */
export function SectionRail({ items, active, onNavigate }: NavProps) {
  return (
    <nav aria-label="Case study sections" data-testid="review-rail" className="sticky top-20 hidden xl:block">
      <p className="eyebrow mb-3 px-3">On this page</p>
      <ol className="relative space-y-0.5 border-l border-line/70">
        {items.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => onNavigate(e, s.id)}
              aria-current={active === s.id ? 'location' : undefined}
              className={clsx(
                'relative -ml-px flex items-baseline gap-2 border-l-2 py-1.5 pl-3 pr-2 text-[13px] leading-5 transition-colors',
                active === s.id ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <span aria-hidden className={clsx('num font-mono text-2xs', active === s.id ? 'text-accent-text' : 'text-ink-subtle')}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
