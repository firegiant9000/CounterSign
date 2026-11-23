import { toLocalDate } from '../core/src/dates';
import {
  readReminderState,
  reminderDue,
  reminderSummary,
} from '../core/src/reminders';
import type { Snapshot } from '../core/src/types';
import type { AlarmApi } from './backup';
import { hasNotifications, showDaily } from './notify';
import { openIdbRepository } from './storage/idb-repository';
import { browserLocalArea, loadSettings } from './storage/settings';
import type { KeyValueArea } from './storage/settings';

export const REMINDER_ALARM = 'countersign-reminder-check';
export const REMINDER_STATE_KEY = 'reminderState';
const REMINDER_LOCK = 'countersign-reminder';

export interface ReminderDeps {
  area: KeyValueArea;
  snapshot(): Promise<Snapshot>;
  now(): Date;
  hasPermission(): Promise<boolean>;
  show(title: string, message: string): Promise<void>;
  /** Runs fn under the lock 'countersign-reminder' if it is free; resolves false without running fn if it is held. */
  tryLock(fn: () => Promise<void>): Promise<boolean>;
}

export type ReminderOutcome =
  'not_due' | 'no_permission' | 'nothing_due' | 'shown' | 'failed' | 'busy';

export async function runReminderCheck(
  deps: ReminderDeps,
): Promise<ReminderOutcome> {
  let outcome: ReminderOutcome = 'not_due';
  try {
    const ran = await deps.tryLock(async () => {
      const now = deps.now();
      const today = toLocalDate(now);
      const settings = await loadSettings(deps.area);
      const state = readReminderState(await deps.area.get(REMINDER_STATE_KEY));
      if (!reminderDue(state, settings, today, now.getHours())) return;
      if (!(await deps.hasPermission())) {
        outcome = 'no_permission';
        return;
      }
      // Recorded before the work, so a failure cannot repeat the notice all day.
      await deps.area.set(REMINDER_STATE_KEY, { lastCheckedOn: today });
      try {
        const summary = reminderSummary(await deps.snapshot(), settings, today);
        if (summary === undefined) {
          outcome = 'nothing_due';
          return;
        }
        await deps.show(summary.title, summary.message);
        outcome = 'shown';
      } catch {
        outcome = 'failed';
      }
    });
    return ran ? outcome : 'busy';
  } catch {
    return 'failed';
  }
}

export async function ensureReminderAlarm(alarms: AlarmApi): Promise<void> {
  const existing = await alarms.get(REMINDER_ALARM);
  if (existing === undefined || existing === null) {
    await alarms.create(REMINDER_ALARM, {
      periodInMinutes: 30,
      delayInMinutes: 1,
    });
  }
}

export function browserReminderDeps(): ReminderDeps {
  return {
    area: browserLocalArea(),
    snapshot: async () => (await openIdbRepository()).snapshot(),
    now: () => new Date(),
    hasPermission: hasNotifications,
    show: showDaily,
    tryLock: (fn) =>
      navigator.locks.request(
        REMINDER_LOCK,
        { ifAvailable: true },
        async (lock) => {
          if (lock === null) return false;
          await fn();
          return true;
        },
      ),
  };
}
