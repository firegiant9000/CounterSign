import type { LocalDate } from './types';

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** The local calendar day of `date`, as zero-padded `YYYY-MM-DD`. */
export function toLocalDate(date: Date): LocalDate {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** True when `text` is exactly `YYYY-MM-DD` and names a real calendar day. */
export function isLocalDate(text: string): boolean {
  if (!SHAPE.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= (daysInMonth[month - 1] ?? 0);
}

/** Whole days from `from` to `to` (negative if `to` is earlier); undefined if either is not a real day. Timezone-free. */
export function daysBetween(
  from: LocalDate,
  to: LocalDate,
): number | undefined {
  if (!isLocalDate(from) || !isLocalDate(to)) return undefined;
  const utc = (d: LocalDate): number =>
    Date.UTC(
      Number(d.slice(0, 4)),
      Number(d.slice(5, 7)) - 1,
      Number(d.slice(8, 10)),
    );
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** Negative if `a` is earlier, 0 if the same day, positive if later. */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
