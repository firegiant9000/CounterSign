import { describe, expect, it } from 'vitest';
import { isFillOutcome, isSiteType } from './formhand';

const notValid: unknown[] = ['nope', undefined, 42, 'toString'];

describe('isSiteType', () => {
  it('accepts a known site type', () => {
    expect(isSiteType('greenhouse')).toBe(true);
  });
  it('rejects unknown strings, undefined, numbers and prototype names', () => {
    for (const v of notValid) expect(isSiteType(v)).toBe(false);
  });
});

describe('isFillOutcome', () => {
  it('accepts a known outcome', () => {
    expect(isFillOutcome('partly')).toBe(true);
  });
  it('rejects unknown strings, undefined, numbers and prototype names', () => {
    for (const v of notValid) expect(isFillOutcome(v)).toBe(false);
  });
});
