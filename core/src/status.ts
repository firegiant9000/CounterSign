import { compareLocalDate } from './dates';
import type { Id, LocalDate, StatusEvent } from './types';

export const STATUS_KEYS = [
  'interested',
  'applied',
  'recruiter_contact',
  'phone_screen',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'no_response',
  'withdrawn',
] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];

export const DEFAULT_STATUS_LABELS: Record<StatusKey, string> = {
  interested: 'Interested',
  applied: 'Applied',
  recruiter_contact: 'Recruiter contact',
  phone_screen: 'Phone screen',
  interview: 'Interview',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  no_response: 'No response',
  withdrawn: 'Withdrawn',
};

/** Statuses that close an application. Archived applications leave the active list. */
export const CLOSED_STATUSES: ReadonlySet<string> = new Set([
  'accepted',
  'rejected',
  'no_response',
  'withdrawn',
]);

/** The calendar day an event happened: `occurredOn`, else the creation day (no time-zone conversion). */
export function effectiveDate(event: StatusEvent): LocalDate {
  return event.occurredOn || event.createdAt.slice(0, 10);
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Oldest first, voided events included. Returns a new array; the input is not mutated. */
export function historyFor(
  events: readonly StatusEvent[],
  applicationId: Id,
): StatusEvent[] {
  return events
    .filter((e) => e.applicationId === applicationId)
    .sort(
      (a, b) =>
        compareLocalDate(effectiveDate(a), effectiveDate(b)) ||
        compareText(a.createdAt, b.createdAt) ||
        compareText(a.id, b.id),
    );
}

/** The latest non-voided event for the application, or undefined when there is none. */
export function currentStatus(
  events: readonly StatusEvent[],
  applicationId: Id,
): StatusEvent | undefined {
  const live = historyFor(events, applicationId).filter((e) => !e.voidedAt);
  return live[live.length - 1];
}

export function isArchived(current: StatusEvent | undefined): boolean {
  return current?.status !== undefined && CLOSED_STATUSES.has(current.status);
}

/** Override for the key, then the default label, then the raw key. Undefined gives 'No status'. */
export function statusLabel(
  key: string | undefined,
  overrides?: Partial<Record<string, string>>,
): string {
  if (key === undefined) return 'No status';
  // hasOwn keeps prototype names such as 'toString' from leaking through as labels.
  const override =
    overrides && Object.hasOwn(overrides, key) ? overrides[key] : undefined;
  if (override) return override;
  const known = STATUS_KEYS.find((k) => k === key);
  if (known) return DEFAULT_STATUS_LABELS[known];
  return key;
}
