import clsx from 'clsx';
import { BookOpenText, Monitor, Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { useServerPhase } from '../../lib/serverStatus';
import { DemoModePill } from '../demo/DemoGate';
import { SnapshotBanner } from './SnapshotBanner';
import { NAV } from '../../lib/nav';
import { useTheme, type ThemePref } from '../../lib/theme';
import { useResource } from '../../lib/useResource';
import type { Health } from '../../lib/types';


export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="ut-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--violet))" />
          <stop offset="1" stopColor="rgb(var(--accent))" />
        </linearGradient>
        <linearGradient id="ut-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--surface-3))" />
          <stop offset="1" stopColor="rgb(var(--surface))" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#ut-bg)" stroke="rgb(var(--line-strong))" />
      {/* "U" for Urbane + a thread running through it */}
      <path d="M9 9v8.5a7 7 0 0 0 14 0V9" fill="none" stroke="url(#ut-g)" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 8.5v9.5" stroke="rgb(var(--accent))" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function HealthDot() {
  const health = useResource<Health>(({ signal }) => api.health({ signal }), 15000);
  const ready = useResource<Health>(({ signal }) => api.ready({ signal }), 15000);
  const phase = useServerPhase();
  const ok = health.data?.status === 'ok';
  const degraded = ok && (ready.error || ready.data?.status !== 'ready');
  const state =
    phase === 'waking' ? 'waking' : health.loading ? 'checking' : !ok ? 'down' : degraded ? 'degraded' : 'healthy';
  const checks = ready.data?.checks;
  const title =
    state === 'healthy'
      ? `API healthy · postgres ${checks?.postgres ?? '?'} · redis ${checks?.redis ?? '?'}`
      : state === 'degraded'
        ? `API up, dependencies not ready${checks ? ` · postgres ${checks.postgres} · redis ${checks.redis}` : ''}`
        : state === 'down'
          ? 'API unreachable'
          : state === 'waking'
            ? 'API is waking up (free-tier server was asleep)'
            : 'Checking API…';
  return (
    <div
      className="flex h-8 items-center gap-2 rounded-full border border-line bg-surface/70 px-2.5 text-xs text-ink-muted"
      title={title}
      role="status"
      aria-label={title}
    >
      <span className="relative flex h-2 w-2">
        {state === 'healthy' && <span className="absolute inset-0 animate-ping rounded-full bg-success/60" />}
        <span
          className={clsx(
            'relative h-2 w-2 rounded-full',
            state === 'healthy' && 'bg-success',
            (state === 'degraded' || state === 'waking') && 'bg-warn',
            state === 'down' && 'bg-danger',
            state === 'checking' && 'bg-ink-subtle',
          )}
        />
      </span>
      <span className="hidden sm:inline">
        {state === 'healthy'
          ? 'API'
          : state === 'degraded'
            ? 'Degraded'
            : state === 'down'
              ? 'Offline'
              : state === 'waking'
                ? 'Waking'
                : 'API'}
      </span>
    </div>
  );
}

function EnvPill() {
  const models = useResource(({ signal }) => api.models({ signal }), 60000);
  if (models.loading) return <div className="skeleton hidden h-8 w-44 rounded-full md:block" />;
  const id = models.data?.aligned_model_id;
  const offline = !id && models.data?.offline_aligned_model_id;
  return (
    <div
      className={clsx(
        'hidden h-8 min-w-0 max-w-[18rem] items-center gap-2 rounded-full border px-3 text-xs md:flex',
        id
          ? 'border-accent/30 bg-accent/10 text-accent-text'
          : offline
            ? 'border-warn/30 bg-warn/10 text-warn'
            : 'border-line bg-surface/70 text-ink-muted',
      )}
      title={
        id
          ? `Aligned model: ${id}`
          : offline
            ? `${offline} undeployed to save credits; base model answers. make demo-redeploy`
            : models.error
              ? 'Model info unavailable'
              : 'No aligned model deployed yet'
      }
    >
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', id ? 'bg-accent' : offline ? 'bg-warn' : 'bg-ink-subtle')} aria-hidden />
      <span className={clsx('truncate', !offline && 'font-mono')}>
        {id ?? (offline ? 'aligned offline · base serving' : models.error ? 'models unavailable' : 'no aligned model')}
      </span>
    </div>
  );
}

function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const opts: { v: ThemePref; icon: typeof Sun; label: string }[] = [
    { v: 'light', icon: Sun, label: 'Light theme' },
    { v: 'system', icon: Monitor, label: 'System theme' },
    { v: 'dark', icon: Moon, label: 'Dark theme' },
  ];
  return (
    <div role="radiogroup" aria-label="Color theme" className="flex h-8 items-center rounded-full border border-line bg-surface/70 p-0.5">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          title={label}
          onClick={() => setPref(v)}
          className={clsx(
            'relative grid h-7 w-7 place-items-center rounded-full transition-colors',
            pref === v ? 'text-ink' : 'text-ink-subtle hover:text-ink',
          )}
        >
          {pref === v && (
            <motion.span
              layoutId="theme-pill"
              className="absolute inset-0 rounded-full bg-surface-3 ring-1 ring-inset ring-line-strong/60"
              transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            />
          )}
          <Icon className="relative h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}

const READ_ONLY_ROUTES = ['/pipeline', '/eval', '/feedback'];

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen">
      <div className="bg-stage" aria-hidden />
      <a
        href="#main"
        className="sr-only rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink shadow-lift focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80]"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label="Urbane Threads Support Copilot home">
            <LogoMark className="h-8 w-8 shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold tracking-tight text-ink">
                <span className="hidden sm:inline">
                  Urbane Threads <span className="text-ink-subtle">·</span>{' '}
                </span>
                <span className="bg-gradient-to-r from-violet-text to-accent-text bg-clip-text text-transparent">Support Copilot</span>
              </p>
              <p className="truncate text-2xs text-ink-subtle">
                <span className="sm:hidden">Urbane Threads</span>
                <span className="hidden sm:inline">Domain-aligned customer support · Nugen</span>
              </p>
            </div>
          </NavLink>
          <div className="ml-auto flex items-center gap-2">
            <NavLink
              to="/review"
              aria-label="Case study"
              title="Engineering case study"
              className={({ isActive }) =>
                clsx(
                  'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-accent/35 bg-accent/10 text-accent-text'
                    : 'border-line bg-surface/70 text-ink-muted hover:border-line-strong hover:text-ink',
                )
              }
            >
              <BookOpenText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden whitespace-nowrap sm:inline">Case study</span>
            </NavLink>
            <DemoModePill />
            <EnvPill />
            <HealthDot />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar (desktop) */}
        <nav
          aria-label="Primary"
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-line/60 px-3 py-5 md:flex"
        >
          <p className="eyebrow mb-2 px-3">Workspace</p>
          <ul className="space-y-0.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    clsx(
                      'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                      isActive ? 'font-medium text-ink' : 'text-ink-muted hover:bg-surface-3/40 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg bg-surface/90 shadow-glass ring-1 ring-inset ring-line"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      {isActive && (
                        <motion.span
                          layoutId="nav-bar"
                          className="absolute -left-3 top-2 h-5 w-[3px] rounded-r-full bg-accent"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon
                        className={clsx('relative h-4 w-4', isActive ? 'text-accent-text' : 'text-ink-subtle group-hover:text-ink-muted')}
                        aria-hidden
                      />
                      <span className="relative">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-auto rounded-xl border border-line/70 bg-surface/50 p-3 text-xs text-ink-muted">
            <p className="font-medium text-ink">Demo workspace</p>
            <p className="mt-1 leading-5">
              Fictional D2C apparel brand. All numbers on these screens come live from the API.
            </p>
          </div>
        </nav>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 md:pb-12 lg:px-10 lg:pt-8">
          <div className="mx-auto max-w-6xl">
            {READ_ONLY_ROUTES.includes(pathname) && <SnapshotBanner />}
            {children}
          </div>
        </main>
      </div>

      {/* Bottom tab bar (mobile) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="grid grid-cols-6">
          {NAV.map(({ to, short, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end
                className={({ isActive }) =>
                  clsx(
                    'relative flex h-16 flex-col items-center justify-center gap-1 text-2xs font-medium',
                    isActive ? 'text-ink' : 'text-ink-subtle',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="tab-active"
                        className="absolute top-0 h-[3px] w-10 rounded-b-full bg-accent"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icon className={clsx('h-5 w-5', isActive && 'text-accent-text')} aria-hidden />
                    {short}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
