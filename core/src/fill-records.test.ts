import { describe, expect, it } from 'vitest';
import { fillRecordOps, MAX_QUESTION, sameAnswerValue } from './fill-records';
import type { FillResult, FillResultRow } from './fill/result';
import { emptySnapshot } from './schema';
import type { Application, Snapshot, Statement } from './types';

const T = '2026-01-01T00:00:00.000Z';

function makeDeps() {
  let n = 0;
  return { now: () => T, newId: () => `n${(n += 1)}` };
}

function makeData(app: Partial<Application> = {}): Snapshot {
  const data = emptySnapshot();
  data.applications.push({ id: 'a1', createdAt: T, ...app });
  return data;
}

function result(
  rows: FillResultRow[],
  siteType: FillResult['siteType'] = 'other',
): FillResult {
  return { url: 'https://example.com/apply', siteType, at: T, rows };
}

const yes = { type: 'yes_no', value: true } as const;
const range = { type: 'money_range', min: 100, max: 200 } as const;

function baseRows(): FillResultRow[] {
  return [
    {
      label: 'Email',
      target: { kind: 'profile', key: 'email' },
      status: 'will_fill',
      outcome: 'written',
      answerValue: { type: 'text', value: 'a@example.com' },
    },
    {
      label: 'Need sponsorship?',
      target: { kind: 'answer', key: 'sponsorship' },
      status: 'will_fill',
      outcome: 'written',
      answerValue: yes,
    },
    {
      label: 'Salary range',
      target: { kind: 'answer', key: 'salary_range' },
      status: 'matches',
      answerValue: range,
    },
    {
      label: 'Relocate?',
      target: { kind: 'answer', key: 'relocation' },
      status: 'differs',
      answerValue: yes,
    },
    {
      label: 'Start date',
      target: { kind: 'answer', key: 'earliest_start_date' },
      status: 'will_fill',
      outcome: 'not_empty',
      answerValue: { type: 'date', value: '2026-02-01' },
    },
    {
      label: 'Reason for leaving',
      target: { kind: 'answer', key: 'reason_for_leaving' },
      status: 'will_fill',
      outcome: 'gone',
      answerValue: { type: 'text', value: 'x' },
    },
    {
      label: 'Work authorization',
      target: { kind: 'answer', key: 'work_authorization' },
      status: 'will_fill',
      outcome: 'failed',
      answerValue: yes,
    },
    {
      label: 'X',
      target: { kind: 'answer', key: 'x' },
      status: 'not_filled',
      answerValue: yes,
    },
  ] as FillResultRow[];
}

function puts(ops: ReturnType<typeof fillRecordOps>['ops']): Statement[] {
  return ops
    .filter((o) => o.kind === 'put' && o.store === 'statements')
    .map((o) => (o as { record: Statement }).record);
}

describe('fillRecordOps', () => {
  it('records written and matching answer rows only', () => {
    const r = fillRecordOps(makeData(), result(baseRows()), 'a1', makeDeps());
    expect(r.recorded).toBe(2);
    expect(r.alreadyOnForm).toBe(1);
    expect(r.missing).toBe(false);
    const st = puts(r.ops);
    expect(st.map((s) => s.answerKey)).toEqual(['sponsorship', 'salary_range']);
    expect(st[0]).toMatchObject({
      id: 'n1',
      createdAt: T,
      applicationId: 'a1',
      value: yes,
      source: 'fill',
      question: 'Need sponsorship?',
    });
    expect(st[1]?.question).toBe('Salary range');
  });

  it('skips a value already recorded', () => {
    const data = makeData();
    data.statements.push({
      id: 's1',
      createdAt: T,
      applicationId: 'a1',
      answerKey: 'sponsorship',
      value: { type: 'yes_no', value: true },
    });
    const r = fillRecordOps(data, result(baseRows()), 'a1', makeDeps());
    expect(r.recorded).toBe(1);
    expect(puts(r.ops).map((s) => s.answerKey)).toEqual(['salary_range']);
  });

  it('adds a different value for the same key', () => {
    const data = makeData();
    data.statements.push({
      id: 's1',
      createdAt: T,
      applicationId: 'a1',
      answerKey: 'sponsorship',
      value: { type: 'yes_no', value: false },
    });
    const r = fillRecordOps(data, result(baseRows()), 'a1', makeDeps());
    expect(r.recorded).toBe(2);
  });

  it('records one statement for two rows with the same key and value', () => {
    const rows: FillResultRow[] = [
      {
        label: 'First',
        target: { kind: 'answer', key: 'sponsorship' },
        status: 'will_fill',
        outcome: 'written',
        answerValue: yes,
      },
      {
        label: 'Second',
        target: { kind: 'answer', key: 'sponsorship' },
        status: 'matches',
        answerValue: { ...yes },
      },
    ];
    const r = fillRecordOps(makeData(), result(rows), 'a1', makeDeps());
    expect(r.recorded).toBe(1);
    expect(r.alreadyOnForm).toBe(0);
    expect(puts(r.ops)[0]?.question).toBe('First');
  });

  it('trims the question and cuts it at 300 characters', () => {
    const rows = baseRows().slice(1, 2);
    rows[0] = { ...rows[0]!, label: `  ${'q'.repeat(400)}  ` };
    const r = fillRecordOps(makeData(), result(rows), 'a1', makeDeps());
    expect(puts(r.ops)[0]?.question).toBe('q'.repeat(MAX_QUESTION));
    expect(MAX_QUESTION).toBe(300);
  });

  it('omits a blank question', () => {
    const rows = baseRows().slice(1, 2);
    rows[0] = { ...rows[0]!, label: '   ' };
    const r = fillRecordOps(makeData(), result(rows), 'a1', makeDeps());
    expect(puts(r.ops)[0]).not.toHaveProperty('question');
  });

  it('sets site type only when empty and not other', () => {
    const set = fillRecordOps(
      makeData(),
      result([], 'lever'),
      'a1',
      makeDeps(),
    );
    expect(set.ops).toHaveLength(1);
    expect(set.ops[0]).toMatchObject({
      kind: 'put',
      store: 'applications',
      record: { id: 'a1', siteType: 'lever' },
    });
    const kept = fillRecordOps(
      makeData({ siteType: 'greenhouse' }),
      result([], 'lever'),
      'a1',
      makeDeps(),
    );
    expect(kept.ops).toEqual([]);
    const other = fillRecordOps(
      makeData(),
      result([], 'other'),
      'a1',
      makeDeps(),
    );
    expect(other.ops).toEqual([]);
  });

  it('gives no ops when nothing is told', () => {
    const r = fillRecordOps(
      makeData(),
      result(baseRows().slice(3)),
      'a1',
      makeDeps(),
    );
    expect(r).toEqual({
      ops: [],
      recorded: 0,
      alreadyOnForm: 0,
      missing: false,
    });
  });

  it('gives missing: true for a missing application', () => {
    const r = fillRecordOps(makeData(), result(baseRows()), 'nope', makeDeps());
    expect(r).toEqual({
      ops: [],
      recorded: 0,
      alreadyOnForm: 0,
      missing: true,
    });
  });

  it('tolerates a null statement value and a non-object answerValue', () => {
    const data = makeData();
    data.statements.push(
      {
        id: 's1',
        createdAt: T,
        applicationId: 'a1',
        answerKey: 'sponsorship',
        value: null,
      } as unknown as Statement,
      {
        id: 's2',
        createdAt: T,
        applicationId: 'a1',
        answerKey: 'salary_range',
        value: 'str',
      } as unknown as Statement,
    );
    const rows = baseRows();
    rows[2] = { ...rows[2]!, answerValue: 'oops' as never };
    const r = fillRecordOps(data, result(rows), 'a1', makeDeps());
    expect(r.recorded).toBe(1);
    expect(r.alreadyOnForm).toBe(0);
    expect(puts(r.ops).map((s) => s.answerKey)).toEqual(['sponsorship']);
  });
});

describe('sameAnswerValue', () => {
  it('treats money ranges as equal with both currency missing', () => {
    expect(
      sameAnswerValue(
        { type: 'money_range', min: 1, max: 2 },
        { type: 'money_range', min: 1, max: 2 },
      ),
    ).toBe(true);
  });

  it('differs on period', () => {
    expect(
      sameAnswerValue(
        { type: 'money_range', min: 1, period: 'year' },
        { type: 'money_range', min: 1, period: 'hour' },
      ),
    ).toBe(false);
  });

  it('is false for different types and for null', () => {
    expect(
      sameAnswerValue(
        { type: 'text', value: 'a' },
        { type: 'choice', value: 'a' },
      ),
    ).toBe(false);
    expect(sameAnswerValue(null, null)).toBe(false);
    expect(sameAnswerValue(yes, null)).toBe(false);
  });

  it('compares the value field for other types', () => {
    expect(sameAnswerValue(yes, { type: 'yes_no', value: true })).toBe(true);
    expect(sameAnswerValue(yes, { type: 'yes_no', value: false })).toBe(false);
  });
});
