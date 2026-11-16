import { describe, expect, it } from 'vitest';
import {
  NO_RESPONSE_DAYS_DEFAULT,
  noResponseDays,
  parseNoResponseDays,
  applySettingsEdit,
  withStatusLabel,
} from './settings';
import type { Settings } from './types';

describe('noResponseDays', () => {
  it('defaults to 30 when unset', () => {
    expect(NO_RESPONSE_DAYS_DEFAULT).toBe(30);
    expect(noResponseDays({})).toBe(30);
  });

  it('keeps a valid whole number of days', () => {
    expect(noResponseDays({ noResponseDays: 45 })).toBe(45);
    expect(noResponseDays({ noResponseDays: 1 })).toBe(1);
    expect(noResponseDays({ noResponseDays: 365 })).toBe(365);
  });

  it('falls back to 30 for out-of-range or non-integer values', () => {
    for (const bad of [0, -5, 2.5, 366, NaN]) {
      expect(noResponseDays({ noResponseDays: bad })).toBe(30);
    }
  });

  it('falls back to 30 for non-number stored values', () => {
    const stored = { noResponseDays: '30' } as unknown as Settings;
    expect(noResponseDays(stored)).toBe(30);
  });
});

describe('parseNoResponseDays', () => {
  it('accepts trimmed ASCII digits in 1..365', () => {
    expect(parseNoResponseDays(' 45 ')).toBe(45);
    expect(parseNoResponseDays('1')).toBe(1);
    expect(parseNoResponseDays('365')).toBe(365);
  });

  it('rejects blank, out-of-range and non-digit text', () => {
    for (const bad of ['', '0', '2.5', '1e2', '-3', '+5', '366', 'abc']) {
      expect(parseNoResponseDays(bad)).toBeUndefined();
    }
  });
});

describe('withStatusLabel', () => {
  it('sets a custom label for a key', () => {
    expect(withStatusLabel({}, 'applied', 'Sent')).toEqual({ applied: 'Sent' });
  });

  it('removes the key when the trimmed text is blank', () => {
    expect(withStatusLabel({ applied: 'Sent' }, 'applied', '  ')).toEqual({});
  });

  it('removes the key when the text equals the default label', () => {
    expect(withStatusLabel({ applied: 'Sent' }, 'applied', 'Applied')).toEqual(
      {},
    );
  });

  it('leaves other keys alone', () => {
    const labels = { applied: 'Sent', rejected: 'Turned down' };
    expect(withStatusLabel(labels, 'applied', 'Submitted')).toEqual({
      applied: 'Submitted',
      rejected: 'Turned down',
    });
  });

  it('does not mutate the input', () => {
    const labels = { applied: 'Sent' };
    withStatusLabel(labels, 'applied', 'Submitted');
    withStatusLabel(labels, 'applied', 'Applied');
    expect(labels).toEqual({ applied: 'Sent' });
  });

  it('works from undefined and non-object labels', () => {
    expect(withStatusLabel(undefined, 'applied', 'Sent')).toEqual({
      applied: 'Sent',
    });
    const junk = 'not an object' as unknown as Settings['statusLabels'];
    expect(withStatusLabel(junk, 'applied', 'Sent')).toEqual({
      applied: 'Sent',
    });
  });
});

describe('applySettingsEdit', () => {
  const current = {
    noResponseDays: 45,
    statusLabels: { applied: 'Sent' },
  } as Settings;

  it('keeps the cut-off and other labels when only one label is edited', () => {
    const next = applySettingsEdit(current, {
      statusLabels: { interested: 'Watching' },
    });
    expect(next.noResponseDays).toBe(45);
    expect(next.statusLabels).toEqual({
      applied: 'Sent',
      interested: 'Watching',
    });
  });

  it('keeps the labels when only the cut-off is edited', () => {
    const next = applySettingsEdit(current, { noResponseDays: 60 });
    expect(next.noResponseDays).toBe(60);
    expect(next.statusLabels).toEqual({ applied: 'Sent' });
  });

  it('removes a label edited to blank or to its default', () => {
    const blank = applySettingsEdit(current, {
      statusLabels: { applied: ' ' },
    });
    expect(blank.statusLabels).toEqual({});
    const dflt = applySettingsEdit(current, {
      statusLabels: { applied: 'Applied' },
    });
    expect(dflt.statusLabels).toEqual({});
  });

  it('keeps unknown top-level and label keys', () => {
    const odd = {
      noResponseDays: 45,
      future: 'x',
      statusLabels: { applied: 'Sent', mystery: 'Keep' },
    } as unknown as Settings;
    const next = applySettingsEdit(odd, {
      statusLabels: { interested: 'Watching' },
    }) as unknown as Record<string, unknown>;
    expect(next.future).toBe('x');
    expect(next.statusLabels).toEqual({
      applied: 'Sent',
      mystery: 'Keep',
      interested: 'Watching',
    });
  });

  it('does not mutate current', () => {
    const before = JSON.stringify(current);
    applySettingsEdit(current, {
      noResponseDays: 10,
      statusLabels: { applied: '' },
    });
    expect(JSON.stringify(current)).toBe(before);
  });

  it('returns settings equal to current for an empty edit', () => {
    const next = applySettingsEdit(current, {});
    expect(next).toEqual(current);
    expect(next).not.toBe(current);
  });
});
