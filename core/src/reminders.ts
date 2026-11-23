import { addDays, compareLocalDate, isLocalDate } from './dates';
import { deadlines } from './deadlines';
import type { LocalDate, ReminderKind, Settings, Snapshot } from './types';

export type { ReminderKind } from './types';

export const REMINDER_KINDS: readonly ReminderKind[] = [
  'follow_up',
  'next_action',
  'task',
  'round',
];
export const DEFAULT_REMINDER_HOUR = 8;

export interface ReminderSettings {
  on: boolean;
  hour: number;
  kinds: Record<ReminderKind, boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readHour(value: unknown): number {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 23
  ) {
    return value;
  }
  return DEFAULT_REMINDER_HOUR;
}

/**
 * Stored settings are not field-checked, so every value is read as unknown. Reminders are
 * off unless `on` is exactly true, and a kind is off only when it is exactly false.
 */
export function reminderSettings(settings: Settings): ReminderSettings {
  const stored: unknown = settings.reminders;
  const raw = isRecord(stored) ? stored : {};
  const storedKinds: unknown = raw.kinds;
  const kindMap = isRecord(storedKinds) ? storedKinds : {};
  const kinds = {} as Record<ReminderKind, boolean>;
  for (const kind of REMINDER_KINDS) {
    kinds[kind] = kindMap[kind] !== false;
  }
  return { on: raw.on === true, hour: readHour(raw.hour), kinds };
}

/**
 * Returns a new settings object whose `reminders` is the normalized current values overlaid
 * with `patch`, then normalized again so the stored object is always well-formed. A patch
 * value that is undefined leaves the current value in place. Other keys of `current` are
 * kept. `current` is not mutated.
 */
export function withReminders(
  current: Settings,
  patch: Partial<ReminderSettings>,
): Settings {
  const base = reminderSettings(current);
  const kinds = {} as Record<ReminderKind, boolean>;
  for (const kind of REMINDER_KINDS) {
    kinds[kind] = patch.kinds?.[kind] ?? base.kinds[kind];
  }
  const merged = {
    on: patch.on ?? base.on,
    hour: patch.hour ?? base.hour,
    kinds,
  };
  return { ...current, reminders: reminderSettings({ reminders: merged }) };
}

export interface ReminderCounts {
  follow_up: number;
  next_action: number;
  task: number;
  roundToday: number;
  roundTomorrow: number;
}

/**
 * Counts what the daily reminder is about. Follow-ups, next actions and tasks count when
 * due today or overdue; interviews count when today or tomorrow. Kinds switched off count
 * 0. Quiet and undated rows never count.
 */
export function reminderCounts(
  data: Snapshot,
  settings: Settings,
  today: LocalDate,
): ReminderCounts {
  const { kinds } = reminderSettings(settings);
  const tomorrow = addDays(today, 1);
  const counts: ReminderCounts = {
    follow_up: 0,
    next_action: 0,
    task: 0,
    roundToday: 0,
    roundTomorrow: 0,
  };
  for (const row of deadlines(data, settings, today)) {
    const date = row.date;
    if (date === undefined || row.kind === 'quiet') continue;
    if (row.kind === 'round') {
      if (!kinds.round) continue;
      if (date === today) counts.roundToday += 1;
      else if (tomorrow !== undefined && date === tomorrow) {
        counts.roundTomorrow += 1;
      }
      continue;
    }
    if (!kinds[row.kind]) continue;
    if (compareLocalDate(date, today) <= 0) counts[row.kind] += 1;
  }
  return counts;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The notification text: counts only, never a name, title or date. */
export function reminderSummary(
  data: Snapshot,
  settings: Settings,
  today: LocalDate,
): { title: string; message: string } | undefined {
  const c = reminderCounts(data, settings, today);
  const todayParts: string[] = [];
  if (c.follow_up > 0)
    todayParts.push(plural(c.follow_up, 'follow-up', 'follow-ups'));
  if (c.next_action > 0) {
    todayParts.push(plural(c.next_action, 'next action', 'next actions'));
  }
  if (c.task > 0) todayParts.push(plural(c.task, 'task', 'tasks'));
  if (c.roundToday > 0) {
    todayParts.push(plural(c.roundToday, 'interview', 'interviews'));
  }
  const sentence: string[] = [];
  if (todayParts.length > 0)
    sentence.push(`${joinParts(todayParts)} due today`);
  if (c.roundTomorrow > 0) {
    sentence.push(
      `${plural(c.roundTomorrow, 'interview', 'interviews')} tomorrow`,
    );
  }
  if (sentence.length === 0) return undefined;
  return { title: 'Countersign', message: `${sentence.join(', and ')}.` };
}

/** What the reminder check remembers between runs. */
export interface ReminderState {
  lastCheckedOn?: LocalDate;
}

/** Keeps `lastCheckedOn` only when it is a real calendar date; anything else is no state. */
export function readReminderState(raw: unknown): ReminderState {
  if (!isRecord(raw)) return {};
  const stored: unknown = raw.lastCheckedOn;
  if (typeof stored === 'string' && isLocalDate(stored)) {
    return { lastCheckedOn: stored };
  }
  return {};
}

/**
 * The daily check is due when reminders are on, the hour has reached the set hour, and it has
 * not already run today. A check on an earlier day does not block it.
 */
export function reminderDue(
  state: ReminderState,
  settings: Settings,
  today: LocalDate,
  hour: number,
): boolean {
  const reminders = reminderSettings(settings);
  return (
    reminders.on && hour >= reminders.hour && state.lastCheckedOn !== today
  );
}
