import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import {
  deleteRoundOps,
  interviewersOf,
  newRoundOps,
  roundsFor,
  updateRoundOps,
} from './rounds';
import type { Round, Snapshot } from './types';

const T = '2026-01-01T00:00:00.000Z';

function snap(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    applications: [{ id: 'app1', createdAt: T }],
    contacts: [
      { id: 'c1', createdAt: T },
      { id: 'c2', createdAt: T },
    ],
    rounds: [],
    ...parts,
  } as unknown as Snapshot;
}

function round(id: string, extra: Record<string, unknown> = {}): Round {
  return { id, createdAt: T, applicationId: 'app1', ...extra };
}

function putRecord(ops: ReturnType<typeof updateRoundOps>): Round {
  const op = ops[0];
  if (!op || op.kind !== 'put') throw new Error('expected a put');
  return op.record as Round;
}

describe('newRoundOps', () => {
  it('stores valid fields, trimming notes', () => {
    const { ops, roundId } = newRoundOps(
      snap(),
      'app1',
      {
        kind: 'technical',
        date: '2026-11-20',
        time: '09:30',
        notes: '  Bring laptop ',
      },
      fixedDeps(),
    );
    expect(ops).toHaveLength(1);
    const r = putRecord(ops);
    expect(r.id).toBe(roundId);
    expect(r).toMatchObject({
      applicationId: 'app1',
      kind: 'technical',
      date: '2026-11-20',
      time: '09:30',
      notes: 'Bring laptop',
    });
  });

  it('omits an unknown kind, bad date and bad time', () => {
    const { ops } = newRoundOps(
      snap(),
      'app1',
      { kind: 'zoom', date: 'soon', time: '25:00', notes: '   ' },
      fixedDeps(),
    );
    const r = putRecord(ops);
    expect('kind' in r).toBe(false);
    expect('date' in r).toBe(false);
    expect('time' in r).toBe(false);
    expect('notes' in r).toBe(false);
  });

  it('throws when the application is missing', () => {
    expect(() => newRoundOps(snap(), 'nope', {}, fixedDeps())).toThrow(
      'This application no longer exists.',
    );
  });

  it('keeps only existing, de-duplicated interviewers; omits an empty list', () => {
    const a = putRecord(
      newRoundOps(
        snap(),
        'app1',
        { interviewerIds: ['c2', 'gone', 'c2', 'c1'] },
        fixedDeps(),
      ).ops,
    );
    expect(a.interviewerIds).toEqual(['c2', 'c1']);
    const b = putRecord(
      newRoundOps(snap(), 'app1', { interviewerIds: ['gone'] }, fixedDeps())
        .ops,
    );
    expect('interviewerIds' in b).toBe(false);
  });
});

describe('interviewersOf', () => {
  it('lists interviewers that still exist, in stored order', () => {
    const r = round('r1', { interviewerIds: ['c1', 'gone', 'c2'] });
    expect(interviewersOf(snap(), r).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('reads a non-array as empty', () => {
    const r = round('r1', { interviewerIds: 'x' });
    expect(interviewersOf(snap(), r)).toEqual([]);
  });
});

describe('updateRoundOps', () => {
  it('removes a debrief field patched blank and keeps identity', () => {
    const r = round('r1', { debriefWentWell: 'Good', notes: 'keep' });
    const out = putRecord(
      updateRoundOps(snap(), r, {
        debriefWentWell: '  ',
        applicationId: 'other',
      } as never),
    );
    expect('debriefWentWell' in out).toBe(false);
    expect(out.notes).toBe('keep');
    expect(out.applicationId).toBe('app1');
    expect(out.id).toBe('r1');
    expect(out.createdAt).toBe(T);
  });

  it('leaves undefined patch fields as stored and replaces present ones', () => {
    const r = round('r1', { kind: 'panel', date: '2026-11-20', time: '10:00' });
    const out = putRecord(
      updateRoundOps(snap(), r, { time: '11:15', date: 'soon' }),
    );
    expect(out.kind).toBe('panel');
    expect(out.time).toBe('11:15');
    expect('date' in out).toBe(false);
  });

  it('removes interviewers when the list normalises to empty', () => {
    const r = round('r1', { interviewerIds: ['c1'] });
    const out = putRecord(updateRoundOps(snap(), r, { interviewerIds: [] }));
    expect('interviewerIds' in out).toBe(false);
  });
});

describe('deleteRoundOps', () => {
  it('deletes the round', () => {
    expect(deleteRoundOps('r1')).toEqual([
      { kind: 'delete', store: 'rounds', id: 'r1' },
    ]);
  });
});

describe('roundsFor', () => {
  it('sorts untimed first, then by time, undated last', () => {
    const data = snap({
      rounds: [
        round('undated'),
        round('timed', { date: '2026-11-20', time: '14:00' }),
        round('untimed', { date: '2026-11-20' }),
        round('other', { applicationId: 'app2', date: '2026-01-01' }),
      ],
    });
    expect(roundsFor(data, 'app1').map((r) => r.id)).toEqual([
      'untimed',
      'timed',
      'undated',
    ]);
  });

  it('does not throw on odd stored values', () => {
    const data = snap({
      rounds: [
        round('a', { date: 42, time: '25:00' }),
        round('b', { date: 'soon', time: {} }),
        round('c', { date: '2026-11-20', time: '09:00' }),
      ],
    });
    expect(roundsFor(data, 'app1').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});
