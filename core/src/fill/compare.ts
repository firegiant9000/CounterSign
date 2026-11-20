import type { ProfileKey } from '../profile';

/** Trimmed, case-insensitive equality. */
export function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Equal digit strings match, as does a shorter number (at least 7 digits)
 * that is the tail of a longer one with 1 to 3 extra leading digits.
 */
export function samePhone(a: string, b: string): boolean {
  const digitsA = a.replace(/\D/g, '');
  const digitsB = b.replace(/\D/g, '');
  if (digitsA === digitsB) {
    return digitsA !== '';
  }
  const [short, long] =
    digitsA.length <= digitsB.length ? [digitsA, digitsB] : [digitsB, digitsA];
  const extra = long.length - short.length;
  return short.length >= 7 && long.endsWith(short) && extra >= 1 && extra <= 3;
}

function normalizeLink(value: string): string {
  let link = value.trim().toLowerCase();
  link = link.replace(/^https?:\/\//, '');
  link = link.replace(/^www\./, '');
  return link.replace(/\/+$/, '');
}

/** Compares URLs or domains, ignoring scheme, leading www. and trailing slashes. */
export function sameLink(a: string, b: string): boolean {
  return normalizeLink(a) === normalizeLink(b);
}

/** Picks the comparison rule for a saved profile key. */
export function sameProfileValue(
  key: ProfileKey,
  formValue: string,
  own: string,
): boolean {
  switch (key) {
    case 'phone':
      return samePhone(formValue, own);
    case 'linkedin':
    case 'github':
    case 'website':
      return sameLink(formValue, own);
    default:
      return sameText(formValue, own);
  }
}
