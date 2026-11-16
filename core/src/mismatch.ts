import { compareLocalDate, isLocalDate } from './dates';
import type { CanonicalAnswer, Statement } from './types';

export type MismatchResult = 'ok' | 'mismatch' | 'compare' | 'exception';

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// Both present and different (case-insensitive, trimmed) means not comparable.
function differs(a: unknown, b: unknown): boolean {
  const x = text(a);
  const y = text(b);
  if (x === undefined || y === undefined) return false;
  return x.trim().toLowerCase() !== y.trim().toLowerCase();
}

function checkMoney(s: Obj, c: Obj): MismatchResult {
  if (differs(s.currency, c.currency) || differs(s.period, c.period))
    return 'compare';
  const cMin = num(c.min);
  const cMax = num(c.max);
  const figures = [num(s.min), num(s.max)].filter(
    (n): n is number => n !== undefined,
  );
  if ((cMin === undefined && cMax === undefined) || figures.length === 0)
    return 'compare';
  const outside = figures.some(
    (f) => (cMin !== undefined && f < cMin) || (cMax !== undefined && f > cMax),
  );
  return outside ? 'mismatch' : 'ok';
}

export function checkStatement(
  statement: Statement,
  answer: CanonicalAnswer | undefined,
): MismatchResult {
  const st: unknown = statement;
  if (isObject(st) && st.exception === true) return 'exception';
  const an: unknown = answer;
  const cv = isObject(an) ? an.value : undefined;
  const sv = isObject(st) ? st.value : undefined;
  if (!isObject(cv) || !isObject(sv)) return 'compare';
  if (typeof cv.type !== 'string' || cv.type !== sv.type) return 'compare';

  switch (cv.type) {
    case 'yes_no':
      if (typeof cv.value !== 'boolean' || typeof sv.value !== 'boolean')
        return 'compare';
      return cv.value === sv.value ? 'ok' : 'mismatch';
    case 'choice': {
      const c = text(cv.value);
      const s = text(sv.value);
      if (c === undefined || s === undefined) return 'compare';
      return c.trim() === s.trim() ? 'ok' : 'mismatch';
    }
    case 'money_range':
      return checkMoney(sv, cv);
    case 'date': {
      const c = text(cv.value);
      const s = text(sv.value);
      if (
        c === undefined ||
        s === undefined ||
        !isLocalDate(c) ||
        !isLocalDate(s)
      ) {
        return 'compare';
      }
      return compareLocalDate(s, c) < 0 ? 'mismatch' : 'ok';
    }
    default:
      return 'compare';
  }
}
