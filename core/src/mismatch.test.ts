import { describe, expect, it } from 'vitest';
import { checkStatement } from './mismatch';
import type { AnswerValue, CanonicalAnswer, Statement } from './types';

const base = { id: 'x', createdAt: '2026-01-01T00:00:00.000Z' };

function stmt(value: unknown, extra: Record<string, unknown> = {}): Statement {
  return { ...base, answerKey: 'k', value, ...extra } as unknown as Statement;
}
function canon(
  value: unknown,
  extra: Record<string, unknown> = {},
): CanonicalAnswer {
  return { ...base, key: 'k', value, ...extra } as unknown as CanonicalAnswer;
}
function money(
  min?: number,
  max?: number,
  extra: Record<string, unknown> = {},
): AnswerValue {
  const v: Record<string, unknown> = { type: 'money_range', ...extra };
  if (min !== undefined) v.min = min;
  if (max !== undefined) v.max = max;
  return v as unknown as AnswerValue;
}
const yn = (value: boolean): AnswerValue => ({ type: 'yes_no', value });
const choice = (value: string): AnswerValue => ({ type: 'choice', value });
const date = (value: string): AnswerValue => ({ type: 'date', value });

describe('checkStatement', () => {
  it('exception true gives exception, even on a differing yes/no', () => {
    expect(
      checkStatement(stmt(yn(true), { exception: true }), canon(yn(false))),
    ).toBe('exception');
  });

  it('exception true wins over a missing answer and a type difference', () => {
    expect(checkStatement(stmt(yn(true), { exception: true }), undefined)).toBe(
      'exception',
    );
    expect(
      checkStatement(
        stmt(date('2026-01-01'), { exception: true }),
        canon(yn(true)),
      ),
    ).toBe('exception');
  });

  it("exception 'yes' falls through to the normal rules", () => {
    expect(
      checkStatement(stmt(yn(true), { exception: 'yes' }), canon(yn(false))),
    ).toBe('mismatch');
  });

  it('yes/no differing gives mismatch, equal gives ok', () => {
    expect(checkStatement(stmt(yn(true)), canon(yn(false)))).toBe('mismatch');
    expect(checkStatement(stmt(yn(true)), canon(yn(true)))).toBe('ok');
  });

  it('choice compares after trim, including values not in choices', () => {
    expect(checkStatement(stmt(choice('No')), canon(choice('Yes')))).toBe(
      'mismatch',
    );
    expect(checkStatement(stmt(choice(' Yes ')), canon(choice('Yes')))).toBe(
      'ok',
    );
    expect(
      checkStatement(
        stmt(choice('Maybe')),
        canon(choice('Maybe'), { choices: ['Yes'] }),
      ),
    ).toBe('ok');
  });

  it('choice trims the canonical side and is case-sensitive', () => {
    expect(checkStatement(stmt(choice('Yes')), canon(choice(' Yes ')))).toBe(
      'ok',
    );
    expect(checkStatement(stmt(choice('yes')), canon(choice('Yes')))).toBe(
      'mismatch',
    );
  });

  it("yes/no with a string 'true' on one side gives compare", () => {
    const bad = { type: 'yes_no', value: 'true' } as unknown as AnswerValue;
    expect(checkStatement(stmt(bad), canon(yn(true)))).toBe('compare');
    expect(checkStatement(stmt(yn(true)), canon(bad))).toBe('compare');
  });

  describe('money with a full canonical range', () => {
    const c = canon(money(100000, 130000));
    it('single figure outside the range is a mismatch', () => {
      expect(checkStatement(stmt(money(90000)), c)).toBe('mismatch');
      expect(checkStatement(stmt(money(140000)), c)).toBe('mismatch');
    });
    it('single figure inside the range is ok', () => {
      expect(checkStatement(stmt(money(120000)), c)).toBe('ok');
    });
    it('a told range sticking out is a mismatch, inside is ok', () => {
      expect(checkStatement(stmt(money(110000, 140000)), c)).toBe('mismatch');
      expect(checkStatement(stmt(money(110000, 120000)), c)).toBe('ok');
    });
    it('figures exactly on a bound are ok', () => {
      expect(checkStatement(stmt(money(100000)), c)).toBe('ok');
      expect(checkStatement(stmt(money(130000)), c)).toBe('ok');
      expect(checkStatement(stmt(money(100000, 130000)), c)).toBe('ok');
    });
    it('a non-finite statement figure is absent, so nothing to compare', () => {
      expect(checkStatement(stmt(money(Number.NaN)), c)).toBe('compare');
    });
    it('currency is trimmed before comparing', () => {
      expect(
        checkStatement(
          stmt(money(120000, undefined, { currency: ' USD ' })),
          canon(money(100000, 130000, { currency: 'usd' })),
        ),
      ).toBe('ok');
    });
  });

  describe('money with one canonical bound', () => {
    it('min only: above is ok, below is a mismatch', () => {
      const c = canon(money(100000));
      expect(checkStatement(stmt(money(500000)), c)).toBe('ok');
      expect(checkStatement(stmt(money(90000)), c)).toBe('mismatch');
    });
    it('max only: below is ok', () => {
      expect(
        checkStatement(stmt(money(50000)), canon(money(undefined, 130000))),
      ).toBe('ok');
    });
  });

  describe('money compare cases', () => {
    it('canonical with neither bound', () => {
      expect(checkStatement(stmt(money(1)), canon(money()))).toBe('compare');
    });
    it('canonical with non-finite bounds counts as absent', () => {
      expect(
        checkStatement(
          stmt(money(1)),
          canon(money(Number.NaN, Number.POSITIVE_INFINITY)),
        ),
      ).toBe('compare');
    });
    it('statement with neither figure', () => {
      expect(checkStatement(stmt(money()), canon(money(1, 2)))).toBe('compare');
    });
    it('currencies differ case-insensitively', () => {
      expect(
        checkStatement(
          stmt(money(1, undefined, { currency: 'USD' })),
          canon(money(1, 2, { currency: 'eur' })),
        ),
      ).toBe('compare');
    });
    it('same currency in different case is the same', () => {
      expect(
        checkStatement(
          stmt(money(1, undefined, { currency: 'usd' })),
          canon(money(1, 2, { currency: 'USD' })),
        ),
      ).toBe('ok');
    });
    it('periods differ', () => {
      expect(
        checkStatement(
          stmt(money(1, undefined, { period: 'hour' })),
          canon(money(1, 2, { period: 'year' })),
        ),
      ).toBe('compare');
    });
    it('one side missing a currency is not a difference', () => {
      expect(
        checkStatement(
          stmt(money(1)),
          canon(money(1, 2, { currency: 'USD', period: 'year' })),
        ),
      ).toBe('ok');
    });
  });

  describe('date', () => {
    const c = canon(date('2027-01-04'));
    it('earlier is a mismatch', () => {
      expect(checkStatement(stmt(date('2026-12-01')), c)).toBe('mismatch');
    });
    it('equal and later are ok', () => {
      expect(checkStatement(stmt(date('2027-01-04')), c)).toBe('ok');
      expect(checkStatement(stmt(date('2027-02-01')), c)).toBe('ok');
    });
    it('an invalid canonical date gives compare', () => {
      expect(
        checkStatement(stmt(date('2027-01-04')), canon(date('2027-13-45'))),
      ).toBe('compare');
    });
    it('an invalid date gives compare', () => {
      expect(checkStatement(stmt(date('soon')), c)).toBe('compare');
    });
  });

  it('text gives compare, even when equal', () => {
    const t: AnswerValue = { type: 'text', value: 'same' };
    expect(checkStatement(stmt(t), canon(t))).toBe('compare');
  });

  describe('malformed input never throws', () => {
    it('answer undefined', () => {
      expect(checkStatement(stmt(yn(true)), undefined)).toBe('compare');
    });
    it('canonical with no value', () => {
      expect(checkStatement(stmt(yn(true)), canon(undefined))).toBe('compare');
    });
    it.each([null, 'x', []])('statement value %j', (v) => {
      expect(checkStatement(stmt(v), canon(yn(true)))).toBe('compare');
    });
    it('type mismatch date vs money_range', () => {
      expect(checkStatement(stmt(date('2026-01-01')), canon(money(1, 2)))).toBe(
        'compare',
      );
    });
  });
});
