/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        'bg-deep': token('bg-deep'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        'surface-3': token('surface-3'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-muted': token('ink-muted'),
        'ink-subtle': token('ink-subtle'),
        accent: token('accent'),
        'accent-ink': token('accent-ink'),
        'accent-text': token('accent-text'),
        violet: token('violet'),
        'violet-text': token('violet-text'),
        success: token('success'),
        warn: token('warn'),
        danger: token('danger'),
        'series-base': token('series-base'),
        'series-aligned': token('series-aligned'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        lift: 'var(--shadow-lift)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 8px 30px -8px rgb(var(--accent) / 0.45)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        caret: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        ping: { '75%, 100%': { transform: 'scale(2.2)', opacity: '0' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--danger) / 0.55)' },
          '70%': { boxShadow: '0 0 0 8px rgb(var(--danger) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--danger) / 0)' },
        },
        'stage-active': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.45)' },
          '50%': { boxShadow: '0 0 0 6px rgb(var(--accent) / 0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        caret: 'caret 1s steps(1) infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
        'stage-active': 'stage-active 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
