import { describe, expect, it } from 'vitest';
import { emptySnapshot } from '../core/src/schema';
import type { Snapshot } from '../core/src/types';
import {
  REMINDER_ALARM,
  REMINDER_STATE_KEY,
  ensureReminderAlarm,
  runReminderCheck,
  type ReminderDeps,
} from './reminders';
import type { AlarmApi } from './backup';

const TODAY = '2026-03-10';

function dueSnapshot(): Snapshot {
  return {
    ...emptySnapshot(),
    tasks: [
      {
        id: 't1',
        createdAt: '2026-03-01T12:00:00.000Z',
        title: 'Invented task',
        dueOn: TODAY,
      },
    ],
  };
}

function setup(
  options: {
    settings?: unknown;
    hour?: number;
    permission?: boolean;
    snapshot?: () => Promise<Snapshot>;
    busy?: boolean;
    show?: () => Promise<void>;
  } = {},
) {
  const map = new Map<string, unknown>();
  map.set(
    'settings',
    'settings' in options
      ? options.settings
      : { reminders: { on: true, hour: 8 } },
  );
  const calls: string[] = [];
  const shown: { title: string; message: string }[] = [];
  const deps: ReminderDeps = {
    area: {
      get: (key) => Promise.resolve(map.get(key)),
      set: (key, value) => {
        calls.push(`set:${key}`);
        map.set(key, value);
        return Promise.resolve();
      },
    },
    snapshot: () => {
      calls.push('snapshot');
      return (options.snapshot ?? (() => Promise.resolve(dueSnapshot())))();
    },
    now: () => new Date(2026, 2, 10, options.hour ?? 9, 0),
    hasPermission: () => Promise.resolve(options.permission ?? true),
    show: (title, message) => {
      calls.push('show');
      shown.push({ title, message });
      return options.show ? options.show() : Promise.resolve();
    },
    tryLock: async (fn) => {
      if (options.busy) return false;
      await fn();
      return true;
    },
  };
  return { deps, map, calls, shown };
}

describe('runReminderCheck', () => {
  it('is not due and writes nothing when reminders are off', async () => {
    const { deps, calls } = setup({ settings: { reminders: { on: false } } });
    expect(await runReminderCheck(deps)).toBe('not_due');
    expect(calls).toEqual([]);
  });

  it('is not due before the set hour', async () => {
    const { deps, calls } = setup({ hour: 7 });
    expect(await runReminderCheck(deps)).toBe('not_due');
    expect(calls).toEqual([]);
  });

  it('returns no_permission and writes nothing without permission', async () => {
    const { deps, calls } = setup({ permission: false });
    expect(await runReminderCheck(deps)).toBe('no_permission');
    expect(calls).toEqual([]);
  });

  it('shows the core text once, with state written before the snapshot', async () => {
    const { deps, map, calls, shown } = setup();
    expect(await runReminderCheck(deps)).toBe('shown');
    expect(calls).toEqual([`set:${REMINDER_STATE_KEY}`, 'snapshot', 'show']);
    expect(shown).toEqual([
      { title: 'Countersign', message: '1 task due today.' },
    ]);
    expect(map.get(REMINDER_STATE_KEY)).toEqual({ lastCheckedOn: TODAY });
  });

  it('is not due on a second run the same day', async () => {
    const { deps, shown } = setup();
    expect(await runReminderCheck(deps)).toBe('shown');
    expect(await runReminderCheck(deps)).toBe('not_due');
    expect(shown).toHaveLength(1);
  });

  it('records the day and stays quiet when nothing is due', async () => {
    const { deps, map, calls } = setup({
      snapshot: () => Promise.resolve(emptySnapshot()),
    });
    expect(await runReminderCheck(deps)).toBe('nothing_due');
    expect(map.get(REMINDER_STATE_KEY)).toEqual({ lastCheckedOn: TODAY });
    expect(calls).not.toContain('show');
  });

  it('returns failed, with state written, when the snapshot throws', async () => {
    const { deps, map, calls } = setup({
      snapshot: () => Promise.reject(new Error('boom')),
    });
    expect(await runReminderCheck(deps)).toBe('failed');
    expect(map.get(REMINDER_STATE_KEY)).toEqual({ lastCheckedOn: TODAY });
    expect(calls).not.toContain('show');
  });

  it('returns failed, with state written, when show throws', async () => {
    const { deps, map } = setup({
      show: () => Promise.reject(new Error('boom')),
    });
    expect(await runReminderCheck(deps)).toBe('failed');
    expect(map.get(REMINDER_STATE_KEY)).toEqual({ lastCheckedOn: TODAY });
  });

  it('returns busy when the lock is held', async () => {
    const { deps, calls } = setup({ busy: true });
    expect(await runReminderCheck(deps)).toBe('busy');
    expect(calls).toEqual([]);
  });
});

describe('ensureReminderAlarm', () => {
  function alarms(existing: unknown) {
    const created: [string, unknown][] = [];
    const api: AlarmApi = {
      get: () => Promise.resolve(existing),
      create: (name, info) => {
        created.push([name, info]);
      },
    };
    return { api, created };
  }

  it('creates the alarm when missing', async () => {
    const { api, created } = alarms(undefined);
    await ensureReminderAlarm(api);
    expect(created).toEqual([
      [REMINDER_ALARM, { periodInMinutes: 30, delayInMinutes: 1 }],
    ]);
  });

  it('does not create the alarm when present', async () => {
    const { api, created } = alarms({ name: REMINDER_ALARM });
    await ensureReminderAlarm(api);
    expect(created).toEqual([]);
  });
});
