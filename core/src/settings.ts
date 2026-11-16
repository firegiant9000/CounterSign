import { DEFAULT_STATUS_LABELS } from './status';
import type { StatusKey } from './status';
import type { Settings } from './types';

export const NO_RESPONSE_DAYS_DEFAULT = 30;

const MIN_DAYS = 1;
const MAX_DAYS = 365;

function isValidDays(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_DAYS && value <= MAX_DAYS;
}

/** Stored settings are not field-checked, so the value is read as unknown. Invalid values give the default. */
export function noResponseDays(settings: Settings): number {
  const value: unknown = settings.noResponseDays;
  if (typeof value === 'number' && isValidDays(value)) return value;
  return NO_RESPONSE_DAYS_DEFAULT;
}

/** Accepts only trimmed ASCII digits (no sign, decimal point or exponent) in 1..365. */
export function parseNoResponseDays(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return isValidDays(value) ? value : undefined;
}

/**
 * Returns a new labels object with `key` set to the trimmed text. Blank text, or text equal
 * to the default label, removes the key. Other keys are kept. The input is not mutated.
 */
export function withStatusLabel(
  labels: Settings['statusLabels'],
  key: StatusKey,
  text: string,
): Partial<Record<StatusKey, string>> {
  const source: unknown = labels;
  const next: Partial<Record<StatusKey, string>> =
    typeof source === 'object' && source !== null
      ? { ...(source as Partial<Record<StatusKey, string>>) }
      : {};
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === DEFAULT_STATUS_LABELS[key]) {
    delete next[key];
  } else {
    next[key] = trimmed;
  }
  return next;
}
