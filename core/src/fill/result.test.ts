import { describe, expect, it } from 'vitest';
import { buildFillResult } from './result';
import type { FillPlan, PlanRow, WriteReport } from './types';

const AT = '2026-11-20T09:00:00.000Z';

function plan(rows: PlanRow[]): FillPlan {
  return { rows, writes: [], unrecognisedOptional: 0, frames: [] };
}

function willFill(ref: number, label = `Field ${ref}`): PlanRow {
  return {
    ref,
    label,
    control: 'text',
    required: false,
    target: { kind: 'profile', key: 'first_name' },
    status: 'will_fill',
    formValue: '',
    ownValue: 'Alex',
    write: { ref, kind: 'value', value: 'Alex' },
  };
}

function differs(ref: number, label = `Field ${ref}`): PlanRow {
  return {
    ref,
    label,
    control: 'text',
    required: false,
    target: { kind: 'profile', key: 'email' },
    status: 'differs',
    formValue: 'old@example.com',
    ownValue: 'new@example.com',
  };
}

function matches(ref: number, label = `Field ${ref}`): PlanRow {
  return {
    ref,
    label,
    control: 'text',
    required: false,
    target: { kind: 'profile', key: 'city' },
    status: 'matches',
    formValue: 'Springfield',
    ownValue: 'Springfield',
  };
}

function notFilled(
  ref: number,
  reason: PlanRow['reason'],
  label = `Field ${ref}`,
): PlanRow {
  return {
    ref,
    label,
    control: 'file',
    required: false,
    status: 'not_filled',
    reason,
    formValue: '',
    ownValue: '',
  };
}

function answerRow(ref: number): PlanRow {
  return {
    ref,
    label: 'Are you authorised to work in the United States?',
    control: 'choice_group',
    required: true,
    target: { kind: 'answer', key: 'work_auth_us' },
    status: 'will_fill',
    formValue: '',
    ownValue: 'Yes',
    write: { ref, kind: 'option', index: 0 },
    answerValue: { type: 'yes_no', value: true },
  };
}

describe('buildFillResult', () => {
  it('canonicalises the address', () => {
    const tabUrl = 'https://example.com/jobs/1?utm_source=x#apply';
    const empty = plan([]);

    expect(
      buildFillResult({ tabUrl, at: AT, plan: empty, outcomes: [] }).url,
    ).toBe('https://example.com/jobs/1');
    expect(
      buildFillResult({
        tabUrl,
        relCanonical: 'https://example.com/jobs/one',
        at: AT,
        plan: empty,
        outcomes: [],
      }).url,
    ).toBe('https://example.com/jobs/one');
  });

  it('sets the site type', () => {
    const result = buildFillResult({
      tabUrl: 'https://jobs.lever.co/example-co/abc123',
      at: AT,
      plan: plan([]),
      outcomes: [],
    });

    expect(result.siteType).toBe('lever');
  });

  it('carries outcomes', () => {
    const outcomes: WriteReport[] = [
      { ref: 1, outcome: 'written' },
      { ref: 2, outcome: 'gone' },
    ];
    const rows = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([willFill(1), willFill(2), differs(3)]),
      outcomes,
    }).rows;

    expect(rows[0]).toStrictEqual({
      label: 'Field 1',
      target: { kind: 'profile', key: 'first_name' },
      status: 'will_fill',
      outcome: 'written',
    });
    expect(rows[1]?.outcome).toBe('gone');
    expect(rows[2]).not.toHaveProperty('outcome');
  });

  it('a will_fill row with no report is failed', () => {
    const rows = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([willFill(1)]),
      outcomes: [],
    }).rows;

    expect(rows[0]?.outcome).toBe('failed');
  });

  it('an answer row carries what item 3 needs', () => {
    const rows = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([answerRow(5)]),
      outcomes: [{ ref: 5, outcome: 'written' }],
    }).rows;

    expect(rows[0]).toStrictEqual({
      label: 'Are you authorised to work in the United States?',
      target: { kind: 'answer', key: 'work_auth_us' },
      status: 'will_fill',
      answerValue: { type: 'yes_no', value: true },
      outcome: 'written',
    });
  });

  it('the first report for a ref wins', () => {
    const rows = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([willFill(1)]),
      outcomes: [
        { ref: 1, outcome: 'written' },
        { ref: 1, outcome: 'failed' },
      ],
    }).rows;

    expect(rows[0]?.outcome).toBe('written');
  });

  it('a report for a ref no row has is ignored', () => {
    const withStray = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([willFill(1)]),
      outcomes: [{ ref: 99, outcome: 'written' }],
    });
    const without = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([willFill(1)]),
      outcomes: [],
    });

    expect(withStray).toStrictEqual(without);
    expect(withStray.rows).toHaveLength(1);
  });

  it('a report for a differs row does not give it an outcome', () => {
    const rows = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([differs(2)]),
      outcomes: [{ ref: 2, outcome: 'written' }],
    }).rows;

    expect(rows[0]).not.toHaveProperty('outcome');
  });

  it('an empty plan gives no rows but keeps url, siteType and at', () => {
    const result = buildFillResult({
      tabUrl: 'https://jobs.lever.co/example-co/abc123?utm_medium=x',
      at: AT,
      plan: plan([]),
      outcomes: [{ ref: 1, outcome: 'written' }],
    });

    expect(result).toStrictEqual({
      url: 'https://jobs.lever.co/example-co/abc123',
      siteType: 'lever',
      at: AT,
      rows: [],
    });
  });

  it('keeps plan row order for mixed statuses', () => {
    const planRows = [
      willFill(1, 'First name'),
      notFilled(2, 'no_value', 'Middle name'),
      differs(3, 'Email'),
      matches(4, 'City'),
      answerRow(5),
    ];
    const rows = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan(planRows),
      outcomes: [],
    }).rows;

    expect(rows.map((row) => row.label)).toStrictEqual(
      planRows.map((row) => row.label),
    );
    expect(rows.map((row) => row.status)).toStrictEqual([
      'will_fill',
      'not_filled',
      'differs',
      'matches',
      'will_fill',
    ]);
  });

  it('a row without target or reason gets no such keys', () => {
    const rows = buildFillResult({
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([notFilled(7, 'file', 'Resume')]),
      outcomes: [],
    }).rows;

    expect(rows[0]).toStrictEqual({
      label: 'Resume',
      status: 'not_filled',
      reason: 'file',
    });
  });

  it('does not change its arguments', () => {
    const input = {
      tabUrl: 'https://example.com/jobs/1',
      at: AT,
      plan: plan([willFill(1), answerRow(5), differs(3)]),
      outcomes: [
        { ref: 1, outcome: 'written' },
        { ref: 5, outcome: 'gone' },
      ] as WriteReport[],
    };
    const snapshot: unknown = JSON.parse(
      JSON.stringify({ plan: input.plan, outcomes: input.outcomes }),
    );

    buildFillResult(input);

    expect({ plan: input.plan, outcomes: input.outcomes }).toStrictEqual(
      snapshot,
    );
  });
});
