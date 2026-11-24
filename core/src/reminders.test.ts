import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_HOUR,
  REMINDER_KINDS,
  reminderCounts,
  reminderDue,
  reminderSettings,
  reminderSummary,
  readReminderState,
  withReminders,
} from './reminders';
import type {
  ReminderKind,
  ReminderSettings,
  ReminderState,
} from './reminders';
import { emptySnapshot } from './schema';
import type {
  Application,
  Contact,
  Round,
  Settings,
  Snapshot,
  Task,
} from './types';

const ALL_ON = { follow_up: true, next_action: true, task: true, round: true };

describe('reminderSettings', () => {
  it('defaults to off, hour 8, every kind on for empty settings', () => {
    expect(DEFAULT_REMINDER_HOUR).toBe(8);
    expect(REMINDER_KINDS).toEqual([
      'follow_up',
      'next_action',
      'task',
      'round',
    ]);
    expect(reminderSettings({})).toEqual({
      on: false,
      hour: 8,
      kinds: ALL_ON,
    });
  });

  it('keeps hour 0 and 23 as valid hours', () => {
    expect(reminderSettings({ reminders: { hour: 0 } }).hour).toBe(0);
    expect(reminderSettings({ reminders: { hour: 23 } }).hour).toBe(23);
  });

  it('falls back to 8 for out-of-range, fractional or non-number hours', () => {
    for (const bad of [24, -1, 7.5, '8', NaN]) {
      const stored = { reminders: { hour: bad } } as unknown as Settings;
      expect(reminderSettings(stored).hour).toBe(8);
    }
  });

  it('falls back to defaults when reminders is not a plain object', () => {
    for (const bad of ['yes', null, 42, ['on']]) {
      const stored = { reminders: bad } as unknown as Settings;
      expect(reminderSettings(stored)).toEqual({
        on: false,
        hour: 8,
        kinds: ALL_ON,
      });
    }
  });

  it('reads kinds as defaults when kinds is null', () => {
    const stored = {
      reminders: { on: true, kinds: null },
    } as unknown as Settings;
    expect(reminderSettings(stored).kinds).toEqual(ALL_ON);
  });

  it('turns only the named kind off when it is exactly false', () => {
    const result = reminderSettings({ reminders: { kinds: { task: false } } });
    expect(result.kinds).toEqual({
      follow_up: true,
      next_action: true,
      task: false,
      round: true,
    });
  });

  it('keeps a kind on when its stored value is not exactly false', () => {
    const stored = {
      reminders: {
        kinds: { task: 'false', round: 0 },
      },
    } as unknown as Settings;
    expect(reminderSettings(stored).kinds).toEqual(ALL_ON);
  });

  it('reads on as true only when it is exactly true', () => {
    expect(reminderSettings({ reminders: { on: true } }).on).toBe(true);
    const stored = { reminders: { on: 'true' } } as unknown as Settings;
    expect(reminderSettings(stored).on).toBe(false);
  });
});

describe('withReminders', () => {
  it('sets the given fields and fills the rest from normalized values', () => {
    const next = withReminders({}, { on: true });
    expect(next.reminders).toEqual({ on: true, hour: 8, kinds: ALL_ON });
  });

  it('keeps noResponseDays and unknown top-level keys', () => {
    const current = {
      noResponseDays: 45,
      future: 'x',
    } as unknown as Settings;
    const next = withReminders(current, { hour: 9 }) as unknown as Record<
      string,
      unknown
    >;
    expect(next.noResponseDays).toBe(45);
    expect(next.future).toBe('x');
    expect(next.reminders).toEqual({ on: false, hour: 9, kinds: ALL_ON });
  });

  it('keeps stored kinds when the patch leaves kinds out', () => {
    const current: Settings = {
      reminders: { on: true, kinds: { round: false } },
    };
    const next = withReminders(current, { hour: 10 });
    expect(next.reminders).toEqual({
      on: true,
      hour: 10,
      kinds: { ...ALL_ON, round: false },
    });
  });

  it('applies a full kinds record from the patch', () => {
    const kind: ReminderKind = 'task';
    const next = withReminders({}, { kinds: { ...ALL_ON, [kind]: false } });
    expect(next.reminders?.kinds).toEqual({ ...ALL_ON, task: false });
  });

  it('stores a well-formed object even when the patch is malformed', () => {
    const bad = { hour: 24 } as unknown as Parameters<typeof withReminders>[1];
    const next = withReminders({}, bad);
    expect(next.reminders).toEqual({ on: false, hour: 8, kinds: ALL_ON });
  });

  it('keeps the stored on value when the patch sets on to undefined', () => {
    const current: Settings = {
      reminders: { on: true, hour: 10, kinds: { task: false } },
    };
    const patch = { on: undefined } as Partial<ReminderSettings>;
    const next = withReminders(current, patch);
    expect(next.reminders).toEqual({
      on: true,
      hour: 10,
      kinds: { ...ALL_ON, task: false },
    });
  });

  it('keeps the stored hour when the patch sets hour to undefined', () => {
    const current: Settings = {
      reminders: { on: true, hour: 10, kinds: { task: false } },
    };
    const patch = { hour: undefined } as Partial<ReminderSettings>;
    const next = withReminders(current, patch);
    expect(next.reminders?.hour).toBe(10);
  });

  it('keeps a stored kind off when the patch sets it to undefined', () => {
    const current: Settings = {
      reminders: { on: true, hour: 10, kinds: { task: false } },
    };
    const patch = {
      kinds: { task: undefined },
    } as unknown as Partial<ReminderSettings>;
    const next = withReminders(current, patch);
    expect(next.reminders?.kinds).toEqual({ ...ALL_ON, task: false });
  });

  it('does not mutate current', () => {
    const current: Settings = {
      noResponseDays: 45,
      reminders: { on: true, kinds: { task: false } },
    };
    const before = JSON.stringify(current);
    withReminders(current, { on: false, hour: 10 });
    expect(JSON.stringify(current)).toBe(before);
  });
});

const TODAY = '2026-03-10';
const YESTERDAY = '2026-03-08';
const TOMORROW = '2026-03-11';
const LATER = '2026-03-12';

function at(day: string): string {
  return `${day}T12:00:00.000Z`;
}

function snap(parts: Partial<Snapshot>): Snapshot {
  return {
    ...emptySnapshot(),
    companies: [
      { id: 'c1', createdAt: at('2026-01-01'), name: 'Acme Widgets' },
    ],
    ...parts,
  };
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    createdAt: at('2026-03-01'),
    title: `Secret task ${id}`,
    ...extra,
  };
}

function contact(id: string, followUpOn: string): Contact {
  return {
    id,
    createdAt: at('2026-03-01'),
    companyId: 'c1',
    name: `Pat Person ${id}`,
    followUpOn,
  };
}

function app(id: string, extra: Partial<Application> = {}): Application {
  return {
    id,
    createdAt: at('2026-01-01'),
    companyId: 'c1',
    title: `Role Title ${id}`,
    ...extra,
  };
}

function round(id: string, date: string): Round {
  return {
    id,
    createdAt: at('2026-03-01'),
    applicationId: 'a1',
    kind: 'phone_screen',
    date,
  };
}

describe('reminderCounts', () => {
  it('counts overdue and today, not later, undated or done rows', () => {
    const data = snap({
      applications: [app('a1')],
      contacts: [contact('k1', YESTERDAY), contact('k2', LATER)],
      tasks: [
        task('t1', { dueOn: TODAY }),
        task('t2'),
        task('t3', { dueOn: TODAY, doneAt: at(TODAY) }),
      ],
      rounds: [round('r1', LATER)],
    });
    expect(reminderCounts(data, {}, TODAY)).toEqual({
      follow_up: 1,
      next_action: 0,
      task: 1,
      roundToday: 0,
      roundTomorrow: 0,
    });
  });

  it('counts interviews today and tomorrow separately', () => {
    const data = snap({
      applications: [app('a1')],
      rounds: [
        round('r1', TODAY),
        round('r2', TOMORROW),
        round('r3', TOMORROW),
      ],
    });
    const counts = reminderCounts(data, {}, TODAY);
    expect(counts.roundToday).toBe(1);
    expect(counts.roundTomorrow).toBe(2);
  });

  it('never counts a quiet application', () => {
    const data = snap({
      applications: [app('a1')],
      statusEvents: [
        {
          id: 'e1',
          createdAt: at('2026-01-01'),
          applicationId: 'a1',
          status: 'applied',
          occurredOn: '2026-01-01',
        },
      ],
    });
    expect(reminderSummary(data, {}, TODAY)).toBeUndefined();
  });

  it('counts an overdue task and an overdue next action', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: YESTERDAY })],
      tasks: [task('t1', { dueOn: YESTERDAY })],
    });
    expect(reminderCounts(data, {}, TODAY)).toMatchObject({
      task: 1,
      next_action: 1,
    });
  });

  it('switches off only the task count with kinds.task false', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: TODAY })],
      contacts: [contact('k1', TODAY)],
      tasks: [task('t1', { dueOn: TODAY })],
      rounds: [round('r1', TODAY)],
    });
    const all = reminderCounts(data, {}, TODAY);
    expect(all).toEqual({
      follow_up: 1,
      next_action: 1,
      task: 1,
      roundToday: 1,
      roundTomorrow: 0,
    });
    const settings: Settings = { reminders: { kinds: { task: false } } };
    expect(reminderCounts(data, settings, TODAY)).toEqual({
      ...all,
      task: 0,
    });
  });

  it('switches off only the follow-up count with kinds.follow_up false', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: TODAY })],
      contacts: [contact('k1', TODAY)],
      tasks: [task('t1', { dueOn: TODAY })],
      rounds: [round('r1', TODAY)],
    });
    const all = reminderCounts(data, {}, TODAY);
    expect(all).toEqual({
      follow_up: 1,
      next_action: 1,
      task: 1,
      roundToday: 1,
      roundTomorrow: 0,
    });
    const settings: Settings = {
      reminders: { kinds: { follow_up: false } },
    };
    expect(reminderCounts(data, settings, TODAY)).toEqual({
      ...all,
      follow_up: 0,
    });
  });
});

describe('reminderSummary', () => {
  it('words two kinds with and', () => {
    const data = snap({
      contacts: [contact('k1', TODAY), contact('k2', YESTERDAY)],
      tasks: [task('t1', { dueOn: TODAY })],
    });
    expect(reminderSummary(data, {}, TODAY)).toEqual({
      title: 'Countersign',
      message: '2 follow-ups and 1 task due today.',
    });
  });

  it('words four kinds with commas and a final and', () => {
    const data = snap({
      applications: [
        app('a1', { nextActionDate: TODAY }),
        app('a2', { nextActionDate: TODAY }),
      ],
      contacts: [contact('k1', TODAY)],
      tasks: [task('t1', { dueOn: TODAY })],
      rounds: [round('r1', TODAY)],
    });
    expect(reminderSummary(data, {}, TODAY)?.message).toBe(
      '1 follow-up, 2 next actions, 1 task and 1 interview due today.',
    );
  });

  it('adds tomorrow after today with a comma and and', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: TODAY })],
      rounds: [round('r1', TOMORROW)],
    });
    expect(reminderSummary(data, {}, TODAY)?.message).toBe(
      '1 next action due today, and 1 interview tomorrow.',
    );
  });

  it('words tomorrow only, singular and plural', () => {
    const one = snap({
      applications: [app('a1')],
      rounds: [round('r1', TOMORROW)],
    });
    expect(reminderSummary(one, {}, TODAY)?.message).toBe(
      '1 interview tomorrow.',
    );
    const two = snap({
      applications: [app('a1')],
      rounds: [round('r1', TOMORROW), round('r2', TOMORROW)],
    });
    expect(reminderSummary(two, {}, TODAY)?.message).toBe(
      '2 interviews tomorrow.',
    );
  });

  it('is undefined when nothing is due', () => {
    expect(reminderSummary(snap({}), {}, TODAY)).toBeUndefined();
    const later = snap({ contacts: [contact('k1', LATER)] });
    expect(reminderSummary(later, {}, TODAY)).toBeUndefined();
  });

  it('drops switched-off kinds, and round off drops both interview counts', () => {
    const data = snap({
      applications: [app('a1')],
      contacts: [contact('k1', TODAY)],
      rounds: [round('r1', TODAY), round('r2', TOMORROW)],
    });
    const settings: Settings = { reminders: { kinds: { round: false } } };
    expect(reminderCounts(data, settings, TODAY)).toMatchObject({
      roundToday: 0,
      roundTomorrow: 0,
      follow_up: 1,
    });
    expect(reminderSummary(data, settings, TODAY)?.message).toBe(
      '1 follow-up due today.',
    );
  });

  it('is undefined with every kind off', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: TODAY })],
      contacts: [contact('k1', TODAY)],
      tasks: [task('t1', { dueOn: TODAY })],
      rounds: [round('r1', TODAY)],
    });
    const settings: Settings = {
      reminders: {
        kinds: {
          follow_up: false,
          next_action: false,
          task: false,
          round: false,
        },
      },
    };
    expect(reminderSummary(data, settings, TODAY)).toBeUndefined();
  });

  it('never contains a company, contact or task name', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: TODAY })],
      contacts: [contact('k1', TODAY)],
      tasks: [task('t1', { dueOn: TODAY })],
      rounds: [round('r1', TOMORROW)],
    });
    const message = reminderSummary(data, {}, TODAY)?.message ?? '';
    expect(message).not.toBe('');
    for (const secret of [
      'Acme',
      'Pat Person',
      'Secret task',
      'Role Title',
      '2026',
    ]) {
      expect(message).not.toContain(secret);
    }
  });

  it('pluralises tasks and interviews due today together', () => {
    const data = snap({
      applications: [app('a1')],
      tasks: [task('t1', { dueOn: TODAY }), task('t2', { dueOn: TODAY })],
      rounds: [round('r1', TODAY), round('r2', TODAY)],
    });
    expect(reminderSummary(data, {}, TODAY)).toEqual({
      title: 'Countersign',
      message: '2 tasks and 2 interviews due today.',
    });
  });
});

describe('readReminderState', () => {
  it('keeps lastCheckedOn only when it is a calendar date', () => {
    expect(readReminderState({ lastCheckedOn: '2026-11-22' })).toEqual({
      lastCheckedOn: '2026-11-22',
    });
    expect(readReminderState({ lastCheckedOn: 'soon' })).toEqual({});
    expect(readReminderState({ lastCheckedOn: 5 })).toEqual({});
  });

  it('drops a date that does not exist in the calendar', () => {
    expect(readReminderState({ lastCheckedOn: '2026-02-30' })).toEqual({});
  });

  it('reads anything that is not a plain object as empty state', () => {
    expect(readReminderState([])).toEqual({});
    expect(readReminderState(null)).toEqual({});
    expect(readReminderState(undefined)).toEqual({});
    expect(readReminderState('2026-11-22')).toEqual({});
  });
});

describe('reminderDue', () => {
  const on: Settings = { reminders: { on: true, hour: 8 } };
  const empty: ReminderState = {};

  it('is never due while reminders are off', () => {
    const off: Settings = { reminders: { on: false, hour: 8 } };
    expect(reminderDue(empty, off, '2026-11-23', 9)).toBe(false);
    expect(reminderDue(empty, {}, '2026-11-23', 9)).toBe(false);
  });

  it('waits for the set hour', () => {
    expect(reminderDue(empty, on, '2026-11-23', 7)).toBe(false);
    expect(reminderDue(empty, on, '2026-11-23', 8)).toBe(true);
  });

  it('is not due again once it has run today', () => {
    const today: ReminderState = { lastCheckedOn: '2026-11-23' };
    expect(reminderDue(today, on, '2026-11-23', 9)).toBe(false);
  });

  it('is due after a check yesterday, but only from the set hour', () => {
    const yesterday: ReminderState = { lastCheckedOn: '2026-11-22' };
    expect(reminderDue(yesterday, on, '2026-11-23', 0)).toBe(false);
    expect(reminderDue(yesterday, on, '2026-11-23', 9)).toBe(true);
  });

  it('runs once a day across midnight', () => {
    // The check ran at 23:50 on 2026-11-22, so that day is recorded.
    const lateCheck: ReminderState = { lastCheckedOn: '2026-11-22' };
    expect(reminderDue(lateCheck, on, '2026-11-22', 23)).toBe(false);
    // At 00:20 the date has changed, but the hour is before 8.
    expect(reminderDue(lateCheck, on, '2026-11-23', 0)).toBe(false);
    // At 08:00 the check runs.
    expect(reminderDue(lateCheck, on, '2026-11-23', 8)).toBe(true);
  });

  it('falls back to the default hour 8 when the stored hour is 24', () => {
    const badHour: Settings = { reminders: { on: true, hour: 24 } };
    expect(reminderDue(empty, badHour, '2026-11-23', 8)).toBe(true);
    expect(reminderDue(empty, badHour, '2026-11-23', 7)).toBe(false);
  });
});
