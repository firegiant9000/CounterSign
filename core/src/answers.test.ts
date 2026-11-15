import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import {
  DEFAULT_ANSWERS,
  answerProblem,
  formatAnswer,
  missingDefaultAnswers,
  reviseAnswer,
} from './answers';

const T = '2026-01-05T09:00:00.000Z';

describe('canonical answers', () => {
  it('offers the six default answers in order', () => {
    expect(DEFAULT_ANSWERS.map((a) => a.key)).toEqual([
      'work_authorization',
      'sponsorship',
      'salary_range',
      'earliest_start_date',
      'relocation',
      'reason_for_leaving',
    ]);
  });

  it('creates only the defaults that are missing', () => {
    const first = missingDefaultAnswers([], fixedDeps());
    expect(first).toHaveLength(6);
    expect(missingDefaultAnswers(first, fixedDeps())).toEqual([]);
    expect(
      missingDefaultAnswers(
        [{ id: 'x', createdAt: T, key: 'sponsorship' }],
        fixedDeps(),
      ),
    ).toHaveLength(5);
  });

  it('keeps the previous value in history', () => {
    const a0 = {
      id: 'x',
      createdAt: T,
      key: 'sponsorship',
      type: 'yes_no' as const,
    };
    const a1 = reviseAnswer(a0, { type: 'yes_no', value: false }, fixedDeps());
    expect(a1.history ?? []).toEqual([]); // nothing to remember yet
    const a2 = reviseAnswer(a1, { type: 'yes_no', value: true }, fixedDeps());
    expect(a2.value).toEqual({ type: 'yes_no', value: true });
    expect(a2.history).toEqual([
      {
        value: { type: 'yes_no', value: false },
        replacedAt: T,
      },
    ]);
  });

  it('returns the same object when nothing changed', () => {
    const a = {
      id: 'x',
      createdAt: T,
      value: { type: 'text' as const, value: 'Growth' },
    };
    expect(
      reviseAnswer(a, { type: 'text', value: 'Growth' }, fixedDeps()),
    ).toBe(a);
  });

  it('records the old value when the answer is cleared', () => {
    const a0 = {
      id: 'x',
      createdAt: T,
      value: { type: 'text' as const, value: 'Growth' },
    };
    const a1 = reviseAnswer(a0, undefined, fixedDeps());
    expect(a1).not.toBe(a0);
    expect('value' in a1).toBe(false);
    expect(a1.history).toEqual([
      {
        value: { type: 'text', value: 'Growth' },
        replacedAt: T,
      },
    ]);
    // The input is never mutated.
    expect(a0.value).toEqual({ type: 'text', value: 'Growth' });
    expect(a0).not.toHaveProperty('history');
  });

  it('reports problems', () => {
    expect(
      answerProblem({ type: 'money_range', min: 140000, max: 120000 }),
    ).toBe('Minimum is above maximum.');
    expect(answerProblem({ type: 'date', value: '2026-02-30' })).toBe(
      'Enter a date as YYYY-MM-DD.',
    );
    expect(answerProblem({ type: 'money_range', min: 120000 })).toBeUndefined();
    expect(answerProblem(undefined)).toBeUndefined();
  });

  it('formats each type', () => {
    expect(formatAnswer({ type: 'yes_no', value: true })).toBe('Yes');
    expect(formatAnswer({ type: 'choice', value: 'Depends on location' })).toBe(
      'Depends on location',
    );
    expect(
      formatAnswer({
        type: 'money_range',
        min: 120000,
        max: 140000,
        currency: 'USD',
        period: 'year',
      }),
    ).toBe('120,000 to 140,000 USD per year');
    expect(formatAnswer({ type: 'money_range', min: 120000 })).toBe(
      'from 120,000',
    );
    expect(formatAnswer({ type: 'date', value: '2027-01-04' })).toBe(
      '2027-01-04',
    );
    expect(formatAnswer(undefined)).toBe('');
  });
});

describe('answers with odd restored records', () => {
  const asValue = (v: unknown) => v as Parameters<typeof formatAnswer>[0];

  it('formats and validates a non-object value as empty', () => {
    for (const v of [null, 5, 'x', [1]]) {
      expect(formatAnswer(asValue(v))).toBe('');
      expect(answerProblem(asValue(v))).toBeUndefined();
    }
  });

  it('ignores non-numeric money bounds and non-string currency or period', () => {
    expect(
      formatAnswer(
        asValue({ type: 'money_range', min: null, max: 90, currency: 5 }),
      ),
    ).toBe('up to 90');
    expect(
      formatAnswer(
        asValue({ type: 'money_range', min: 'a', max: NaN, period: {} }),
      ),
    ).toBe('');
  });

  it('formats a non-boolean yes_no as empty', () => {
    expect(formatAnswer(asValue({ type: 'yes_no', value: 'yes' }))).toBe('');
    expect(formatAnswer(asValue({ type: 'yes_no', value: null }))).toBe('');
  });

  it('revises an answer whose history is not a list', () => {
    const answer = {
      id: 'x',
      createdAt: T,
      key: 'k',
      label: 'K',
      type: 'text',
      value: { type: 'text', value: 'a' },
      history: {},
    } as unknown as Parameters<typeof reviseAnswer>[0];
    const next = reviseAnswer(
      answer,
      { type: 'text', value: 'b' },
      fixedDeps(),
    );
    expect(next.history).toEqual([
      { value: { type: 'text', value: 'a' }, replacedAt: T },
    ]);
  });
});
