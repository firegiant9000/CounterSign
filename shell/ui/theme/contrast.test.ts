import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, parseTokens } from './contrast';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
const tokens = parseTokens(css);

const COLOURS = [
  '--desk',
  '--sheet',
  '--card',
  '--ink',
  '--ink-muted',
  '--rule',
  '--margin',
  '--ink-maroon',
  '--ink-green',
  '--ink-blue',
  '--ink-ochre',
  '--ink-faded',
  '--primary',
  '--on-primary',
  '--focus',
  '--print-paper',
  '--print-ink',
];
const OTHER = [
  '--stamp-opacity',
  '--grain-opacity',
  '--font-display',
  '--font-body',
  '--font-typed',
  '--step--1',
  '--step-0',
  '--step-1',
  '--step-2',
  '--step-3',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
];
const INKS = [
  '--ink-maroon',
  '--ink-green',
  '--ink-blue',
  '--ink-ochre',
  '--ink-faded',
];

describe('contrast helpers', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
  it('blends', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('parseTokens throws with no dark block', () => {
    expect(() => parseTokens(':root { --a: #000000; }')).toThrow();
  });
});

describe('tokens.css', () => {
  for (const theme of ['day', 'night'] as const) {
    it(`every token in the table exists in ${theme}`, () => {
      const missing = [...COLOURS, ...OTHER].filter(
        (t) => tokens[theme][t] === undefined,
      );
      expect(missing).toEqual([]);
    });

    it(`colour tokens are six-digit hex in ${theme}`, () => {
      const bad = COLOURS.filter(
        (t) => !/^#[0-9a-f]{6}$/.test(tokens[theme][t] ?? ''),
      );
      expect(bad).toEqual([]);
    });

    it(`every listed pair meets AA in ${theme}`, () => {
      const t = tokens[theme];
      const stamp = Number(t['--stamp-opacity']);
      const pairs: [string, string, number][] = [];
      for (const fg of ['--ink', '--ink-muted']) {
        for (const bg of ['--desk', '--sheet', '--card']) {
          pairs.push([t[fg]!, t[bg]!, 4.5]);
        }
      }
      for (const fg of INKS) {
        for (const bg of ['--sheet', '--card']) {
          pairs.push([t[fg]!, t[bg]!, 4.5]);
        }
        pairs.push([blend(t[fg]!, t['--card']!, stamp), t['--card']!, 4.5]);
      }
      pairs.push([t['--on-primary']!, t['--primary']!, 4.5]);
      for (const bg of ['--desk', '--sheet', '--card']) {
        pairs.push([t['--focus']!, t[bg]!, 3]);
      }
      if (theme === 'day') {
        pairs.push([t['--print-ink']!, t['--print-paper']!, 4.5]);
      }
      const failures = pairs
        .map(([fg, bg, min]) => ({ fg, bg, min, r: contrastRatio(fg, bg) }))
        .filter((p) => p.r < p.min);
      expect(failures).toEqual([]);
    });
  }

  it('limits opacity tokens', () => {
    expect(Number(tokens.day['--stamp-opacity'])).toBe(0.9);
    expect(Number(tokens.day['--grain-opacity'])).toBeLessThanOrEqual(0.08);
  });
});
