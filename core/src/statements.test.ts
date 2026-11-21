import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import { deleteApplicationOps } from './application-ops';
import { emptySnapshot } from './schema';
import {
  deleteStatementOps,
  newStatement,
  putStatementOps,
  resolveAsException,
  resolveByUpdatingCanonical,
  statementsFor,
} from './statements';
import type { AnswerValue, CanonicalAnswer, Statement } from './types';

const T = '2026-01-05T09:00:00.000Z';
const money: AnswerValue = {
  type: 'money_range',
  min: 100000,
  max: 130000,
  currency: 'USD',
  period: 'year',
};

describe('newStatement', () => {
  it('copies the answer value so edits do not reach the canonical', () => {
    const answer: CanonicalAnswer = {
      id: 'k1',
      createdAt: T,
      key: 'salary_range',
      value: money,
    };
    const s = newStatement(answer, 'a1', fixedDeps());
    expect(s).toMatchObject({
      id: 'id-1',
      createdAt: T,
      applicationId: 'a1',
      answerKey: 'salary_range',
      value: money,
    });
    expect('exception' in s).toBe(false);
    (s.value as { min?: number }).min = 1;
    expect((answer.value as { min?: number }).min).toBe(100000);
  });

  it('has no value when the answer has none', () => {
    const s = newStatement(
      { id: 'k1', createdAt: T, key: 'sponsorship' },
      'a1',
      fixedDeps(),
    );
    expect('value' in s).toBe(false);
  });
});

describe('putStatementOps', () => {
  const base: Statement = {
    id: 's1',
    createdAt: T,
    applicationId: 'a1',
    answerKey: 'k',
    value: { type: 'text', value: 'old' },
    exception: true,
  };

  it('sets the value and clears exception', () => {
    const ops = putStatementOps(base, { type: 'text', value: 'new' });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'put', store: 'statements' });
    const rec = (ops[0] as { record: Statement }).record;
    expect(rec.value).toEqual({ type: 'text', value: 'new' });
    expect('exception' in rec).toBe(false);
  });

  it('removes the value when undefined', () => {
    const rec = (putStatementOps(base, undefined)[0] as { record: Statement })
      .record;
    expect('value' in rec).toBe(false);
  });

  it('drops source when the owner edits a fill statement', () => {
    const fill: Statement = {
      id: 's1',
      createdAt: '2026-01-01T00:00:00.000Z',
      applicationId: 'a1',
      answerKey: 'salary_range',
      value: { type: 'text', value: 'x' },
      source: 'fill',
      question: 'Expected salary?',
    };
    const rec = (
      putStatementOps(fill, { type: 'text', value: 'y' })[0] as {
        record: Statement;
      }
    ).record;
    expect('source' in rec).toBe(false);
    expect(rec.question).toBe('Expected salary?');
    expect(rec.value).toEqual({ type: 'text', value: 'y' });
  });

  it('keeps question and still clears exception', () => {
    const withQuestion: Statement = {
      ...base,
      question: 'Expected salary?',
    };
    const rec = (
      putStatementOps(withQuestion, { type: 'text', value: 'new' })[0] as {
        record: Statement;
      }
    ).record;
    expect(rec.question).toBe('Expected salary?');
    expect('exception' in rec).toBe(false);
  });
});

describe('deleteStatementOps', () => {
  it('deletes by id', () => {
    expect(deleteStatementOps('s1')).toEqual([
      { kind: 'delete', store: 'statements', id: 's1' },
    ]);
  });
});

describe('resolveByUpdatingCanonical', () => {
  const canonical: CanonicalAnswer = {
    id: 'k1',
    createdAt: T,
    key: 'earliest_start_date',
    value: { type: 'date', value: '2027-01-04' },
  };
  const entry: Statement = {
    id: 's1',
    createdAt: T,
    applicationId: 'a1',
    answerKey: 'earliest_start_date',
    value: { type: 'date', value: '2026-12-01' },
  };

  it('updates the canonical and keeps its history', () => {
    const deps = fixedDeps();
    const ops = resolveByUpdatingCanonical(entry, canonical, deps);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'put', store: 'canonicalAnswers' });
    const rec = (ops[0] as { record: CanonicalAnswer }).record;
    expect(rec.value).toEqual(entry.value);
    expect(rec.history?.at(-1)).toEqual({
      value: { type: 'date', value: '2027-01-04' },
      replacedAt: T,
    });
  });

  it('does not share the value object with the statement', () => {
    const ops = resolveByUpdatingCanonical(entry, canonical, fixedDeps());
    const rec = (ops[0] as { record: CanonicalAnswer }).record;
    expect(rec.value).not.toBe(entry.value);
    expect(rec.value).toEqual(entry.value);
  });

  it('never writes statements when updating the canonical', () => {
    const ops = resolveByUpdatingCanonical(entry, canonical, fixedDeps());
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops)
      expect(op).toMatchObject({ store: 'canonicalAnswers' });
  });

  it('returns nothing for an equal value or an entry without a value', () => {
    expect(
      resolveByUpdatingCanonical(
        { ...entry, value: { type: 'date', value: '2027-01-04' } },
        canonical,
        fixedDeps(),
      ),
    ).toEqual([]);
    const noValue: Statement = { ...entry };
    delete noValue.value;
    expect(resolveByUpdatingCanonical(noValue, canonical, fixedDeps())).toEqual(
      [],
    );
  });

  it('tolerates a non-object value from a restored file', () => {
    const odd = { ...entry, value: 'x' as unknown as AnswerValue };
    expect(resolveByUpdatingCanonical(odd, canonical, fixedDeps())).toEqual([]);
  });
});

describe('resolveAsException', () => {
  it('sets exception and keeps every other field', () => {
    const s: Statement = {
      id: 's1',
      createdAt: T,
      applicationId: 'a1',
      answerKey: 'k',
      value: { type: 'text', value: 'v' },
    };
    const ops = resolveAsException(s);
    expect(ops).toEqual([
      {
        kind: 'put',
        store: 'statements',
        record: { ...s, exception: true },
      },
    ]);
  });
});

describe('statementsFor', () => {
  it('ignores other applications and orders by createdAt then id', () => {
    const data = emptySnapshot();
    data.statements.push(
      { id: 'b', createdAt: '2026-01-02T00:00:00.000Z', applicationId: 'a1' },
      { id: 'x', createdAt: '2026-01-01T00:00:00.000Z', applicationId: 'a2' },
      { id: 'c', createdAt: '2026-01-02T00:00:00.000Z', applicationId: 'a1' },
      { id: 'a', createdAt: '2026-01-03T00:00:00.000Z', applicationId: 'a1' },
    );
    expect(statementsFor(data, 'a1').map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('deleteApplicationOps with statements', () => {
  it('deletes statements with their application', () => {
    const data = emptySnapshot();
    data.statements.push(
      { id: 's1', createdAt: T, applicationId: 'a1' },
      { id: 's2', createdAt: T, applicationId: 'a1' },
      { id: 's3', createdAt: T, applicationId: 'a2' },
    );
    const ops = deleteApplicationOps(data, 'a1');
    const deleted = ops
      .filter((o) => o.kind === 'delete' && o.store === 'statements')
      .map((o) => (o as { id: string }).id);
    expect(deleted).toEqual(['s1', 's2']);
    expect(ops.at(-1)).toEqual({
      kind: 'delete',
      store: 'applications',
      id: 'a1',
    });
  });
});
