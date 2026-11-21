import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import { emptySnapshot } from './schema';
import { markAppliedOps, recordTickedOps, toldPanel } from './told-panel';
import type {
  Application,
  AnswerValue,
  CanonicalAnswer,
  Snapshot,
  Statement,
  StatusEvent,
} from './types';

const T = '2026-01-05T09:00:00.000Z';
const yes: AnswerValue = { type: 'yes_no', value: true };
const notice: AnswerValue = { type: 'text', value: '2 weeks' };

const app: Application = { id: 'a1', createdAt: T };

function answer(
  id: string,
  key: string | undefined,
  value: AnswerValue = yes,
): CanonicalAnswer {
  const c: CanonicalAnswer = { id, createdAt: T };
  if (key !== undefined) c.key = key;
  c.value = value;
  return c;
}

/** A canonical answer with no value field at all. */
function valueless(id: string, key: string): CanonicalAnswer {
  return { id, createdAt: T, key };
}

function statement(
  id: string,
  answerKey: string | undefined,
  applicationId = 'a1',
): Statement {
  const s: Statement = { id, createdAt: T, applicationId };
  if (answerKey !== undefined) s.answerKey = answerKey;
  return s;
}

function event(
  id: string,
  status: StatusEvent['status'],
  extra: Partial<StatusEvent> = {},
): StatusEvent {
  return {
    id,
    createdAt: T,
    applicationId: 'a1',
    status,
    occurredOn: '2026-01-05',
    ...extra,
  };
}

function snapshot(parts: Partial<Snapshot> = {}): Snapshot {
  return { ...emptySnapshot(), applications: [app], ...parts };
}

describe('toldPanel', () => {
  it('lists canonical answers not yet stated on the application, in canonical order', () => {
    const data = snapshot({
      canonicalAnswers: [
        answer('c1', 'sponsorship'),
        answer('c2', 'notice', notice),
        answer('c3', 'relocation'),
      ],
    });
    const panel = toldPanel(data, 'a1');
    expect(panel.unrecorded.map((c) => c.key)).toEqual([
      'sponsorship',
      'notice',
      'relocation',
    ]);
    expect(panel.missing).toBe(false);
  });

  it('excludes keys already stated on this application, by fill or by hand', () => {
    const data = snapshot({
      canonicalAnswers: [
        answer('c1', 'sponsorship'),
        answer('c2', 'notice', notice),
        answer('c3', 'relocation'),
      ],
      statements: [
        { ...statement('s1', 'sponsorship'), source: 'fill', value: yes },
        statement('s2', 'notice'),
      ],
    });
    expect(toldPanel(data, 'a1').unrecorded.map((c) => c.key)).toEqual([
      'relocation',
    ]);
  });

  it('counts a statement as stating its key whatever its value', () => {
    const data = snapshot({
      canonicalAnswers: [answer('c1', 'sponsorship')],
      statements: [statement('s1', 'sponsorship')],
    });
    expect(toldPanel(data, 'a1').unrecorded).toEqual([]);
  });

  it('ignores statements that belong to another application', () => {
    const data = snapshot({
      canonicalAnswers: [answer('c1', 'sponsorship')],
      statements: [statement('s1', 'sponsorship', 'a2')],
    });
    expect(toldPanel(data, 'a1').unrecorded.map((c) => c.key)).toEqual([
      'sponsorship',
    ]);
  });

  it('skips keyless, empty-key, valueless and malformed-value answers', () => {
    const data = snapshot({
      canonicalAnswers: [
        answer('c1', undefined),
        answer('c2', ''),
        valueless('c3', 'no_value'),
        answer('c4', 'null_value', null as unknown as AnswerValue),
        answer('c5', 'array_value', [] as unknown as AnswerValue),
        answer('c6', 'string_value', 'yes' as unknown as AnswerValue),
        answer('c7', 'sponsorship'),
      ],
    });
    expect(toldPanel(data, 'a1').unrecorded.map((c) => c.key)).toEqual([
      'sponsorship',
    ]);
  });

  it('keeps only the first canonical answer for a duplicate key', () => {
    const data = snapshot({
      canonicalAnswers: [
        answer('c1', 'sponsorship', yes),
        answer('c2', 'sponsorship', { type: 'yes_no', value: false }),
      ],
    });
    const panel = toldPanel(data, 'a1');
    expect(panel.unrecorded.map((c) => c.id)).toEqual(['c1']);
  });

  it('uses the first valid answer when an earlier duplicate has no usable value', () => {
    const data = snapshot({
      canonicalAnswers: [
        valueless('c1', 'sponsorship'),
        answer('c2', 'sponsorship', yes),
      ],
    });
    expect(toldPanel(data, 'a1').unrecorded.map((c) => c.id)).toEqual(['c2']);
  });

  it('offers Mark Applied when there are no status events', () => {
    expect(toldPanel(snapshot(), 'a1').offerApplied).toBe(true);
  });

  it('offers Mark Applied at interested', () => {
    const data = snapshot({ statusEvents: [event('e1', 'interested')] });
    expect(toldPanel(data, 'a1').offerApplied).toBe(true);
  });

  it.each(['applied', 'interview', 'rejected'] as const)(
    'does not offer Mark Applied at %s',
    (status) => {
      const data = snapshot({ statusEvents: [event('e1', status)] });
      expect(toldPanel(data, 'a1').offerApplied).toBe(false);
    },
  );

  it('offers Mark Applied again once the applied event is voided', () => {
    const data = snapshot({
      statusEvents: [
        event('e1', 'interested', { occurredOn: '2026-01-04' }),
        event('e2', 'applied', { voidedAt: '2026-01-06T09:00:00.000Z' }),
      ],
    });
    expect(toldPanel(data, 'a1').offerApplied).toBe(true);
  });

  it('reports a missing application with an empty, unoffered panel', () => {
    expect(toldPanel(snapshot(), 'nope')).toEqual({
      unrecorded: [],
      offerApplied: false,
      missing: true,
    });
  });
});

describe('recordTickedOps', () => {
  it('puts one hand-ticked statement per ticked unrecorded key', () => {
    const data = snapshot({
      canonicalAnswers: [
        answer('c1', 'sponsorship'),
        answer('c2', 'notice', notice),
      ],
    });
    const result = recordTickedOps(
      data,
      'a1',
      ['notice', 'sponsorship'],
      fixedDeps(),
    );
    expect(result.missing).toBe(false);
    expect(result.ops).toEqual([
      {
        kind: 'put',
        store: 'statements',
        record: {
          id: 'id-1',
          createdAt: T,
          applicationId: 'a1',
          answerKey: 'sponsorship',
          value: yes,
        },
      },
      {
        kind: 'put',
        store: 'statements',
        record: {
          id: 'id-2',
          // fixedDeps advances one second per now() call
          createdAt: '2026-01-05T09:00:01.000Z',
          applicationId: 'a1',
          answerKey: 'notice',
          value: notice,
        },
      },
    ]);
  });

  it('writes no source or question on hand-ticked statements', () => {
    const data = snapshot({ canonicalAnswers: [answer('c1', 'sponsorship')] });
    const { ops } = recordTickedOps(data, 'a1', ['sponsorship'], fixedDeps());
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op?.kind === 'put' && op.store === 'statements').toBe(true);
    const record = (op as { record: Statement }).record;
    expect('source' in record).toBe(false);
    expect('question' in record).toBe(false);
  });

  it('ignores a key that is already recorded and an unknown key', () => {
    const data = snapshot({
      canonicalAnswers: [
        answer('c1', 'sponsorship'),
        answer('c2', 'notice', notice),
      ],
      statements: [statement('s1', 'sponsorship')],
    });
    const result = recordTickedOps(
      data,
      'a1',
      ['sponsorship', 'unknown_key', 'notice'],
      fixedDeps(),
    );
    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]).toMatchObject({
      kind: 'put',
      store: 'statements',
      record: { answerKey: 'notice' },
    });
  });

  it('gives one statement for a key ticked twice', () => {
    const data = snapshot({ canonicalAnswers: [answer('c1', 'sponsorship')] });
    const result = recordTickedOps(
      data,
      'a1',
      ['sponsorship', 'sponsorship'],
      fixedDeps(),
    );
    expect(result.ops).toHaveLength(1);
  });

  it('returns no ops and missing when the application does not exist', () => {
    const data = snapshot({ canonicalAnswers: [answer('c1', 'sponsorship')] });
    expect(recordTickedOps(data, 'nope', ['sponsorship'], fixedDeps())).toEqual(
      { ops: [], missing: true },
    );
  });
});

describe('markAppliedOps', () => {
  it('puts an applied event dated today and reports its id', () => {
    const result = markAppliedOps(snapshot(), 'a1', '2026-01-21', fixedDeps());
    expect(result).toEqual({
      ops: [
        {
          kind: 'put',
          store: 'statusEvents',
          record: {
            id: 'id-1',
            createdAt: T,
            applicationId: 'a1',
            status: 'applied',
            occurredOn: '2026-01-21',
          },
        },
      ],
      eventId: 'id-1',
      missing: false,
    });
  });

  it('returns no ops when the application is already applied', () => {
    const data = snapshot({ statusEvents: [event('e1', 'applied')] });
    expect(markAppliedOps(data, 'a1', '2026-01-21', fixedDeps())).toEqual({
      ops: [],
      missing: false,
    });
  });

  it('returns no ops and missing when the application does not exist', () => {
    expect(
      markAppliedOps(snapshot(), 'nope', '2026-01-21', fixedDeps()),
    ).toEqual({ ops: [], missing: true });
  });
});
