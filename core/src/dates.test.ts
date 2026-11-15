import { describe, expect, it } from 'vitest';
import { compareLocalDate, isLocalDate, toLocalDate } from './dates';

describe('local dates', () => {
  it('formats the local calendar day', () => {
    expect(toLocalDate(new Date(2026, 10, 14, 23, 30))).toBe('2026-11-14');
    expect(toLocalDate(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
  it('accepts only real days', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-2-3')).toBe(false);
    expect(isLocalDate('2026-11-14T00:00:00Z')).toBe(false);
    expect(isLocalDate('')).toBe(false);
  });
  it('orders days', () => {
    expect(compareLocalDate('2026-03-02', '2026-03-10')).toBeLessThan(0);
    expect(compareLocalDate('2026-03-10', '2026-03-10')).toBe(0);
  });
});
