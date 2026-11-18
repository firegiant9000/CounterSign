import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Rules for every stylesheet under shell/ui. Each rule is a pure helper so the
// self-checks below run the same code that the real-file tests run.

const UI_DIR = join(import.meta.dirname, '..');
const ROOT = join(UI_DIR, '..', '..');

// Legacy stylesheets, removed in Task 28. Compared with forward slashes so
// Windows backslashes from the directory walk still match.
const LEGACY = ['shell/ui/styles.css', 'shell/ui/popup.css'];
const LEGACY_SET = new Set(LEGACY.map((p) => p.split(/[\\/]/).join('/')));

const TOKENS = 'shell/ui/theme/tokens.css';
const COMPONENTS = 'shell/ui/components/';
// Decision 7: these two may be wider than the popup allows.
const WIDTH_EXEMPT = ['Page.css', 'BinderTabs.css'];

export interface Finding {
  line: number;
  text: string;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function allMatches(text: string, pattern: RegExp): RegExpMatchArray[] {
  return [...text.matchAll(pattern)];
}

// Replace each comment with spaces of the same length so line numbers and
// offsets in the stripped text still match the original file.
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

// Index ranges [start, end) of every block opened by `opener`, found by
// brace counting from the opener's '{'. Unclosed blocks are dropped.
function blockRanges(text: string, opener: RegExp): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const m of allMatches(text, opener)) {
    const start = m.index ?? 0;
    const open = start + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') {
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          ranges.push([start, i]);
          break;
        }
      }
    }
  }
  return ranges;
}

// Rule 1: colour literals. Matches comments too, on purpose.
const COLOUR_PATTERNS = [/#[0-9a-f]{3,8}\b/gi, /\brgba?\(/gi, /\bhsla?\(/gi];

export function colourLiterals(css: string): Finding[] {
  const found: Finding[] = [];
  for (const pattern of COLOUR_PATTERNS) {
    for (const m of allMatches(css, pattern)) {
      found.push({ line: lineOf(css, m.index ?? 0), text: m[0] });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

// Rule 2: width and min-width in components must fit the 336px popup.
const WIDTH_DECL = /(^|[;{\s])((?:min-)?width)\s*:\s*([^;{}]*)/gi;
const LENGTH_VALUE = /(\d*\.?\d+)\s*(px|rem)\b/gi;

export function wideWidths(css: string): Finding[] {
  const text = stripComments(css);
  const found: Finding[] = [];
  for (const m of allMatches(text, WIDTH_DECL)) {
    const prop = m[2] ?? '';
    const value = (m[3] ?? '').replace(/!important/i, '').trim();
    const at = (m.index ?? 0) + (m[1] ?? '').length;
    const line = lineOf(text, at);
    const decl = `${prop}: ${value}`;
    if (/[\d.]\s*vw\b/i.test(value)) {
      found.push({ line, text: decl });
      continue;
    }
    for (const n of allMatches(value, LENGTH_VALUE)) {
      const amount = Number(n[1]);
      const unit = (n[2] ?? '').toLowerCase();
      if ((unit === 'px' && amount > 336) || (unit === 'rem' && amount > 21)) {
        found.push({ line, text: decl });
        break;
      }
    }
  }
  return found;
}

// Rule 3: animation and transition declarations sit inside a
// @media (prefers-reduced-motion: no-preference) block.
const MOTION_DECL =
  /(^|[;{\s])(-[a-z]+-)?((?:animation|transition)(?:-[a-z-]+)?)\s*:/gi;
const MOTION_GUARD =
  /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{/gi;

export function unguardedMotion(css: string): Finding[] {
  const text = stripComments(css);
  const guarded = blockRanges(text, MOTION_GUARD);
  const found: Finding[] = [];
  for (const m of allMatches(text, MOTION_DECL)) {
    const at = (m.index ?? 0) + (m[1] ?? '').length;
    const inside = guarded.some(([start, end]) => at > start && at < end);
    if (!inside) {
      found.push({ line: lineOf(text, at), text: m[3] ?? '' });
    }
  }
  return found;
}

// File discovery: every .css under shell/ui, minus the legacy pair.
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

const relPath = (file: string): string =>
  relative(ROOT, file).split(sep).join('/');
const read = (file: string): string => readFileSync(file, 'utf8');
const SOURCE_CSS = walk(UI_DIR).filter((f) => !LEGACY_SET.has(relPath(f)));
// No components/ directory yet is fine: the list is simply empty.
const COMPONENT_CSS = SOURCE_CSS.filter(
  (f) =>
    relPath(f).startsWith(COMPONENTS) && !WIDTH_EXEMPT.includes(basename(f)),
);

function report(files: string[], check: (css: string) => Finding[]): string[] {
  return files.flatMap((f) =>
    check(read(f)).map((v) => `${relPath(f)}:${v.line} ${v.text}`),
  );
}

describe('theme and component CSS rules', () => {
  it('no colour literals outside tokens.css', () => {
    // Guards against a path bug that would make this test vacuous.
    expect(SOURCE_CSS.map(relPath)).toContain(TOKENS);
    const files = SOURCE_CSS.filter((f) => relPath(f) !== TOKENS);
    expect(report(files, colourLiterals)).toEqual([]);
  });

  it('components fit the popup', () => {
    expect(report(COMPONENT_CSS, wideWidths)).toEqual([]);
  });

  it('motion respects reduced motion', () => {
    expect(report(SOURCE_CSS, unguardedMotion)).toEqual([]);
  });
});

// Self-checks: each rule rejects a bad sample and accepts a good one, so the
// real-file tests cannot pass vacuously while no components exist.
describe('CSS rule self-checks', () => {
  it('colour rule rejects hex, rgb() and hsl() and accepts var()', () => {
    expect(colourLiterals('.a { color: #fff; }')).toHaveLength(1);
    expect(colourLiterals('.a { color: rgba(0, 0, 0, 0.5); }')).toHaveLength(1);
    expect(colourLiterals('.a { color: hsl(0 0% 0%); }')).toHaveLength(1);
    expect(colourLiterals('/* #abcdef */')).toHaveLength(1);
    expect(
      colourLiterals(
        '.a { color: var(--ink); background: url(/theme/grain.png); }',
      ),
    ).toEqual([]);
  });

  it('components rule rejects vw and widths above the popup and accepts 21rem', () => {
    expect(wideWidths('.a { width: 50vw; }')).toHaveLength(1);
    expect(wideWidths('.a { min-width: calc(100vw - 1rem); }')).toHaveLength(1);
    expect(wideWidths('.a { width: 22rem; }')).toHaveLength(1);
    expect(wideWidths('.a { width: 337px; }')).toHaveLength(1);
    expect(wideWidths('.a { width: 21rem; min-width: 336px; }')).toEqual([]);
    expect(wideWidths('.a { max-width: 50vw; } /* width: 50vw */')).toEqual([]);
  });

  it('motion rule rejects bare declarations and accepts guarded ones', () => {
    expect(unguardedMotion('.a { transition: opacity 1s; }')).toHaveLength(1);
    expect(unguardedMotion('.a { animation-name: spin; }')).toHaveLength(1);
    expect(unguardedMotion('.a { transition-duration: 1s; }')).toHaveLength(1);
    expect(
      unguardedMotion(
        '@media (prefers-reduced-motion: no-preference) { .a { transition: opacity 1s; } } .b { color: red; }',
      ),
    ).toEqual([]);
    // The guard block closes before the bare declaration.
    expect(
      unguardedMotion(
        '@media (prefers-reduced-motion: no-preference) { .a { color: red; } } .b { transition: none; }',
      ),
    ).toHaveLength(1);
    // Selectors and comments that contain the word are not declarations.
    expect(
      unguardedMotion(
        '.transition:hover { color: red; } /* animation: none */',
      ),
    ).toEqual([]);
  });
});
