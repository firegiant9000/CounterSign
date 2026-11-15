import { describe, expect, it } from 'vitest';
import { STATUS_RULES, statusRuleFor } from './mapping';

describe('STATUS_RULES', () => {
  it('uses only lower-case keys', () => {
    for (const key of Object.keys(STATUS_RULES)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});

describe('statusRuleFor', () => {
  it('trims and lower-cases before lookup', () => {
    expect(statusRuleFor('  Closed ')).toEqual({
      kind: 'status',
      status: 'position_closed',
    });
  });

  it('collapses internal whitespace before lookup', () => {
    expect(statusRuleFor('Needs  Review')).toEqual({ kind: 'carry-forward' });
  });

  it('returns undefined for inherited Object properties', () => {
    expect(statusRuleFor('toString')).toBeUndefined();
  });

  it('returns undefined for blank input', () => {
    expect(statusRuleFor('')).toBeUndefined();
  });
});
