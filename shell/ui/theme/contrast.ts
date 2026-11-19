export interface ThemeTokens {
  day: Record<string, string>;
  night: Record<string, string>;
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/** Reads the day `:root {}` block and the dark-mode override block. */
export function parseTokens(css: string): ThemeTokens {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const dark =
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}\s*\}/.exec(
      stripped,
    );
  if (!dark) throw new Error('tokens.css has no dark block');
  const rest = stripped.replace(dark[0], '');
  const day = /:root\s*\{([^}]*)\}/.exec(rest);
  if (!day) throw new Error('tokens.css has no day :root block');
  const dayTokens = declarations(day[1]!);
  return { day: dayTokens, night: { ...dayTokens, ...declarations(dark[1]!) } };
}

function channels(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex))
    throw new Error(`not a #rrggbb colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `fg` at `alpha` opacity over `bg`, as #rrggbb. */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = channels(fg);
  const b = channels(bg);
  return (
    '#' +
    f
      .map((c, i) =>
        Math.round(c * alpha + b[i]! * (1 - alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
