import { addDays, compareLocalDate, isLocalDate } from './dates';
import { contactEventDate, isLiveEvent } from './followups';
import type { WriteOp } from './repository';
import type { StatusKey } from './status';
import type {
  Deps,
  LocalDate,
  Snapshot,
  StatusEvent,
  WeeklyReview,
} from './types';

/** The Monday on or before `day`, or undefined when `day` is not a real date. */
export function weekStart(day: LocalDate): LocalDate | undefined {
  if (typeof day !== 'string' || !isLocalDate(day)) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d));
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y!, m! - 1, d! - sinceMonday))
    .toISOString()
    .slice(0, 10);
}

export interface WeeklyCounts {
  outreach: number;
  conversations: number;
  applications: number;
  followUps: number;
}

function statusDate(e: StatusEvent): LocalDate {
  const on: unknown = e.occurredOn;
  if (typeof on === 'string' && on !== '') return on;
  const created: unknown = e.createdAt;
  return typeof created === 'string' ? created.slice(0, 10) : '';
}

function countBetween(
  data: Snapshot,
  from: LocalDate | undefined,
  to: LocalDate | undefined,
): WeeklyCounts {
  const inRange = (day: LocalDate): boolean =>
    from === undefined ||
    to === undefined ||
    (isLocalDate(day) &&
      compareLocalDate(day, from) >= 0 &&
      compareLocalDate(day, to) <= 0);
  const counts: WeeklyCounts = {
    outreach: 0,
    conversations: 0,
    applications: 0,
    followUps: 0,
  };
  for (const e of data.contactEvents) {
    if (!isLiveEvent(e) || !inRange(contactEventDate(e))) continue;
    if (e.kind === 'reached_out') counts.outreach += 1;
    else if (e.kind === 'call_held') counts.conversations += 1;
    else if (e.kind === 'followed_up') counts.followUps += 1;
  }
  const applied = new Set<string>();
  for (const e of data.statusEvents) {
    const voided: unknown = e.voidedAt;
    const status: unknown = e.status;
    if (voided || typeof status !== 'string' || !inRange(statusDate(e)))
      continue;
    if (status === 'phone_screen' || status === 'interview') {
      counts.conversations += 1;
    } else if (status === 'applied') {
      const appId: unknown = e.applicationId;
      if (typeof appId === 'string') applied.add(appId);
    }
  }
  counts.applications = applied.size;
  return counts;
}

/** Counts for the seven days from `monday`. */
export function weeklyCounts(data: Snapshot, monday: LocalDate): WeeklyCounts {
  const sunday = addDays(monday, 6);
  if (sunday === undefined) {
    return { outreach: 0, conversations: 0, applications: 0, followUps: 0 };
  }
  return countBetween(data, monday, sunday);
}

/** The same counts with no date range. */
export function totalCounts(data: Snapshot): WeeklyCounts {
  return countBetween(data, undefined, undefined);
}

export const STAGE_ORDER: readonly StatusKey[] = [
  'interested',
  'applied',
  'recruiter_contact',
  'phone_screen',
  'interview',
  'offer',
  'accepted',
];

/** Per application, the furthest stage reached among live events. Closed statuses other than accepted are not stages. */
export function furthestStageCounts(
  data: Snapshot,
): { stage: StatusKey; count: number }[] {
  const furthest = new Map<string, number>();
  for (const e of data.statusEvents) {
    const voided: unknown = e.voidedAt;
    const status: unknown = e.status;
    const appId: unknown = e.applicationId;
    if (voided || typeof appId !== 'string' || typeof status !== 'string') {
      continue;
    }
    const idx = (STAGE_ORDER as readonly string[]).indexOf(status);
    if (idx < 0) continue;
    if (idx > (furthest.get(appId) ?? -1)) furthest.set(appId, idx);
  }
  const tally = STAGE_ORDER.map(() => 0);
  for (const idx of furthest.values()) tally[idx] = (tally[idx] ?? 0) + 1;
  return STAGE_ORDER.map((stage, i) => ({
    stage,
    count: tally[i] ?? 0,
  })).filter((row) => row.count > 0);
}

function validNumber(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 999
    ? value
    : undefined;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Records for the week, first created first (then id). */
function recordsFor(data: Snapshot, monday: LocalDate): WeeklyReview[] {
  return data.weeklyReviews
    .filter((r) => r.weekStart === monday)
    .sort(
      (a, b) =>
        compareText(String(a.createdAt), String(b.createdAt)) ||
        compareText(a.id, b.id),
    );
}

export function planFor(
  data: Snapshot,
  monday: LocalDate,
): { outreachTarget?: number; applicationCap?: number; record?: WeeklyReview } {
  const record = recordsFor(data, monday)[0];
  if (!record) return {};
  const out: {
    outreachTarget?: number;
    applicationCap?: number;
    record?: WeeklyReview;
  } = { record };
  const target = validNumber(record.outreachTarget);
  const cap = validNumber(record.applicationCap);
  if (target !== undefined) out.outreachTarget = target;
  if (cap !== undefined) out.applicationCap = cap;
  return out;
}

/** Blank gives undefined, a whole number 0..999 gives the number, anything else is 'invalid'. */
export function parsePlanNumber(text: string): number | undefined | 'invalid' {
  const t = text.trim();
  if (t === '') return undefined;
  if (!/^\d+$/.test(t)) return 'invalid';
  const n = Number(t);
  return n <= 999 ? n : 'invalid';
}

export function setPlanOps(
  data: Snapshot,
  monday: LocalDate,
  plan: { outreachTarget?: number; applicationCap?: number },
  deps: Deps,
): WriteOp[] {
  const records = recordsFor(data, monday);
  const [first, ...duplicates] = records;
  const bothAbsent =
    plan.outreachTarget === undefined && plan.applicationCap === undefined;
  if (bothAbsent) {
    return records.map((r) => ({
      kind: 'delete',
      store: 'weeklyReviews',
      id: r.id,
    }));
  }
  const dropDuplicates: WriteOp[] = duplicates.map((r) => ({
    kind: 'delete',
    store: 'weeklyReviews',
    id: r.id,
  }));
  if (!first) {
    const record: WeeklyReview = {
      id: deps.newId(),
      createdAt: deps.now(),
      weekStart: monday,
    };
    if (plan.outreachTarget !== undefined) {
      record.outreachTarget = plan.outreachTarget;
    }
    if (plan.applicationCap !== undefined) {
      record.applicationCap = plan.applicationCap;
    }
    return [{ kind: 'put', store: 'weeklyReviews', record }];
  }
  if (
    validNumber(first.outreachTarget) === plan.outreachTarget &&
    validNumber(first.applicationCap) === plan.applicationCap
  ) {
    return dropDuplicates;
  }
  const record: WeeklyReview = { ...first };
  if (plan.outreachTarget === undefined) delete record.outreachTarget;
  else record.outreachTarget = plan.outreachTarget;
  if (plan.applicationCap === undefined) delete record.applicationCap;
  else record.applicationCap = plan.applicationCap;
  return [{ kind: 'put', store: 'weeklyReviews', record }, ...dropDuplicates];
}

/** A note, never a block: shown only when applications go over the cap. */
export function capNote(
  counts: WeeklyCounts,
  cap: number | undefined,
): string | undefined {
  if (typeof cap !== 'number' || counts.applications <= cap) return undefined;
  const n = counts.applications;
  const noun = n === 1 ? 'application' : 'applications';
  return `${n} ${noun} this week, above your plan of ${cap}. This is a note, not a limit.`;
}
