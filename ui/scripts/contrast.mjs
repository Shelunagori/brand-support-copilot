#!/usr/bin/env node
// WCAG 2.x contrast check for design-token pairs in src/index.css.
// Usage: node scripts/contrast.mjs   (exits 1 on any failure)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8');

function block(theme) {
  const re = new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\n  \\}`);
  const m = css.match(re);
  if (!m) throw new Error(`theme block not found: ${theme}`);
  const tokens = {};
  for (const t of m[1].matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    tokens[t[1]] = [Number(t[2]), Number(t[3]), Number(t[4])];
  }
  return tokens;
}

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Composite a translucent surface over the page background.
const over = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));

// [foreground, background, minimum ratio, note]
const TEXT = 4.5;
const LARGE = 3;
const pairs = [
  ['ink', 'bg', TEXT],
  ['ink-muted', 'bg', TEXT],
  ['ink-subtle', 'bg', TEXT],
  ['ink', 'surface', TEXT],
  ['ink-muted', 'surface', TEXT],
  ['ink-subtle', 'surface', TEXT],
  ['ink-muted', 'surface-2', TEXT],
  ['ink-subtle', 'surface-2', TEXT],
  ['ink-muted', 'surface-3', TEXT],
  ['accent-ink', 'accent', TEXT, 'primary button label'],
  ['accent-text', 'bg', TEXT],
  ['accent-text', 'surface', TEXT],
  ['violet-text', 'bg', TEXT],
  ['violet-text', 'surface', TEXT],
  ['success', 'surface', TEXT],
  ['warn', 'surface', TEXT],
  ['danger', 'surface', TEXT],
  ['success', 'bg', TEXT],
  ['warn', 'bg', TEXT],
  ['danger', 'bg', TEXT],
  ['accent', 'bg', LARGE, 'focus ring / non-text UI'],
  ['series-base', 'surface', LARGE, 'chart mark'],
  ['series-aligned', 'surface', LARGE, 'chart mark'],
];

let failures = 0;
for (const theme of ['light', 'dark']) {
  const t = block(theme);
  const glass = Number(css.match(new RegExp(`\\[data-theme='${theme}'\\][\\s\\S]*?--glass-alpha:\\s*([\\d.]+)`))?.[1] ?? 1);
  console.log(`\n${theme.toUpperCase()} theme (glass surfaces composited at alpha ${glass})`);
  for (const [fg, bg, min, note] of pairs) {
    const fgc = t[fg];
    let bgc = t[bg];
    if (!fgc || !bgc) throw new Error(`missing token ${fg} or ${bg} in ${theme}`);
    if (bg.startsWith('surface')) bgc = over(bgc, t.bg, glass);
    const r = ratio(fgc, bgc);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${fg.padEnd(15)} on ${bg.padEnd(10)} ${r.toFixed(2).padStart(6)} (min ${min})${note ? `  · ${note}` : ''}`,
    );
  }
}
console.log(failures ? `\n${failures} pair(s) below WCAG AA.` : '\nAll token pairs meet WCAG AA.');
process.exit(failures ? 1 : 0);
