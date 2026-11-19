import type { StatusKey } from '../../core/src/status';

export type Ink = 'maroon' | 'green' | 'blue' | 'ochre' | 'faded' | 'none';

const INK_BY_STATUS = new Map<StatusKey, Ink>([
  ['interview', 'maroon'],
  ['offer', 'green'],
  ['accepted', 'green'],
  ['phone_screen', 'blue'],
  ['recruiter_contact', 'ochre'],
  ['interested', 'faded'],
  ['applied', 'faded'],
  ['rejected', 'faded'],
  ['position_closed', 'faded'],
  ['no_response', 'faded'],
  ['withdrawn', 'faded'],
]);

/** Ink for a status value. Known keys map per the ink table; any other non-empty string is faded; anything else is none. */
export function inkFor(status: unknown): Ink {
  if (typeof status !== 'string' || status === '') return 'none';
  return INK_BY_STATUS.get(status as StatusKey) ?? 'faded';
}

/** CSS class for an ink, or undefined for 'none' (no class added). */
export function inkClass(ink: Ink): string | undefined {
  return ink === 'none' ? undefined : `ink-${ink}`;
}
