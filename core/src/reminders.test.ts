import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_HOUR,
  REMINDER_KINDS,
  reminderSettings,
  withReminders,
} from './reminders';
import type { ReminderKind } from './reminders';
import type { Settings } from './types';

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
