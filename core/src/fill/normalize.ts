const NEGATION_WORDS =
  /(?<![\p{L}\p{N}])(?:not|never|without|unless|except|cannot|no longer)(?![\p{L}\p{N}])/u;
const CONTRACTION = /[\p{L}\p{N}]n['’]t(?![\p{L}\p{N}])/u;
const PLACEHOLDER_START = /^(?:select|choose|please|pick)/;

/** Lower-cases a label and reduces it to single-spaced letter and digit words. */
export function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .split('(required)')
    .join('')
    .split('(optional)')
    .join('')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True when the phrase appears as whole words. Both arguments must already be normalised. */
export function containsPhrase(normalized: string, phrase: string): boolean {
  if (phrase === '') return false;
  return (' ' + normalized + ' ').includes(' ' + phrase + ' ');
}

/** Reads the raw label, because normalising would remove apostrophes. */
export function hasNegation(raw: string): boolean {
  const lower = raw.toLowerCase();
  return NEGATION_WORDS.test(lower) || CONTRACTION.test(lower);
}

/** Decides whether an option is a "pick one" placeholder rather than a real answer. */
export function isPlaceholderOption(
  text: string,
  value: string,
  index: number,
): boolean {
  if (value === '') return true;
  if (index !== 0) return false;
  if (PLACEHOLDER_START.test(text.trim().toLowerCase())) return true;
  return !/[\p{L}\p{N}]/u.test(text);
}
