import { describe, expect, it } from 'vitest';
import type { Ink } from '../status-ink';
import { ledgerRowClass } from './ledger-row';

describe('ledgerRowClass', () => {
  const cases: [Ink, string][] = [
    ['maroon', 'cs-row ink-maroon'],
    ['green', 'cs-row ink-green'],
    ['blue', 'cs-row ink-blue'],
    ['ochre', 'cs-row ink-ochre'],
    ['faded', 'cs-row ink-faded'],
    ['none', 'cs-row'],
  ];
  it.each(cases)('maps %s to %s', (ink, expected) => {
    expect(ledgerRowClass(ink)).toBe(expected);
  });
});
