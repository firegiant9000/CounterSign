import type { ReminderKind, Settings } from './types';

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
 * with `patch`, then normalized again so the stored object is always well-formed. Other keys
 * of `current` are kept. `current` is not mutated.
 */
export function withReminders(
  current: Settings,
  patch: Partial<ReminderSettings>,
): Settings {
  const base = reminderSettings(current);
  const merged = {
    ...base,
    ...patch,
    kinds: { ...base.kinds, ...patch.kinds },
  };
  return { ...current, reminders: reminderSettings({ reminders: merged }) };
}
