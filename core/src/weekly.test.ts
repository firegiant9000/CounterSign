import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import {
  capNote,
  furthestStageCounts,
  parsePlanNumber,
  planFor,
  setPlanOps,
  totalCounts,
  weekStart,
  weeklyCounts,
} from './weekly';
import type { Snapshot } from './types';

const MON = '2026-11-16';

function snap(parts: Record<string, unknown[]> = {}): Snapshot {
  return {
    contactEvents: [],
    statusEvents: [],
    weeklyReviews: [],
    ...parts,
  } as unknown as Snapshot;
}

let n = 0;
function ce(kind: string, on: string | undefined, extra: object = {}) {
  n += 1;
  return {
    id: `c${n}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    kind,
    ...(on ? { occurredOn: on } : {}),
    ...extra,
  };
}
function se(
  app: string,
  status: unknown,
  on: string | undefined,
  extra: object = {},
) {
  n += 1;
  return {
    id: `s${n}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    applicationId: app,
    status,
    ...(on ? { occurredOn: on } : {}),
    ...extra,
  };
}
function plan(id: string, createdAt: string, extra: object = {}) {
  return { id, createdAt, weekStart: MON, ...extra };
}

describe('weekStart', () => {
  it('Sunday belongs to the week before', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
  });
  it('year boundary', () => {
    expect(weekStart('2026-12-31')).toBe('2026-12-28');
    expect(weekStart('2027-01-03')).toBe('2026-12-28');
    expect(weekStart('x')).toBeUndefined();
  });
});

describe('weeklyCounts', () => {
  it('counts from events', () => {
    const data = snap({
      contactEvents: [
        ce('reached_out', '2026-11-17'),
        ce('reached_out', '2026-11-18'),
        ce('call_held', '2026-11-19'),
      ],
      statusEvents: [
        se('a1', 'interview', '2026-11-20'),
        se('a2', 'applied', '2026-11-16'),
        se('a2', 'applied', '2026-11-17'),
        se('a3', 'applied', '2026-11-18'),
      ],
    });
    expect(weeklyCounts(data, MON)).toEqual({
      outreach: 2,
      conversations: 2,
      applications: 2,
      followUps: 0,
    });
    const more = snap({ contactEvents: [ce('followed_up', '2026-11-17')] });
    expect(weeklyCounts(more, MON).followUps).toBe(1);
  });

  it('voided events are not counted', () => {
    const data = snap({
      contactEvents: [
        ce('reached_out', '2026-11-17', {
          voidedAt: '2026-11-18T00:00:00.000Z',
        }),
      ],
      statusEvents: [
        se('a1', 'applied', '2026-11-17', {
          voidedAt: '2026-11-18T00:00:00.000Z',
        }),
      ],
    });
    expect(weeklyCounts(data, MON)).toEqual({
      outreach: 0,
      conversations: 0,
      applications: 0,
      followUps: 0,
    });
  });

  it('edges of the week', () => {
    const data = snap({
      contactEvents: [
        ce('reached_out', '2026-11-16'),
        ce('reached_out', '2026-11-22'),
        ce('reached_out', '2026-11-15'),
        ce('reached_out', '2026-11-23'),
        ce('reached_out', undefined, { createdAt: '2026-11-18T10:00:00.000Z' }),
      ],
    });
    expect(weeklyCounts(data, MON).outreach).toBe(3);
  });

  it('skips odd records without throwing', () => {
    const data = snap({
      contactEvents: [ce('nonsense', '2026-11-17'), { id: 'x', createdAt: 5 }],
      statusEvents: [
        se('a1', 7, '2026-11-17'),
        se(undefined as unknown as string, 'applied', '2026-11-17'),
        { id: 'y' },
      ],
    });
    expect(weeklyCounts(data, MON).applications).toBe(0);
    expect(totalCounts(data).outreach).toBe(0);
  });

  it('totalCounts has no date range', () => {
    const data = snap({
      contactEvents: [
        ce('reached_out', '2025-01-01'),
        ce('reached_out', '2026-11-17'),
      ],
      statusEvents: [
        se('a1', 'applied', '2025-02-02'),
        se('a1', 'applied', '2026-02-02'),
      ],
    });
    expect(totalCounts(data)).toEqual({
      outreach: 2,
      conversations: 0,
      applications: 1,
      followUps: 0,
    });
  });
});

describe('furthestStageCounts', () => {
  it('never a rejection count', () => {
    const data = snap({
      statusEvents: [
        se('a1', 'applied', '2026-11-01'),
        se('a1', 'interview', '2026-11-05'),
        se('a1', 'rejected', '2026-11-09'),
        se('a2', 'applied', '2026-11-01'),
        se('a3', 'rejected', '2026-11-01'),
        se('a4', 'offer', '2026-11-01', {
          voidedAt: '2026-11-02T00:00:00.000Z',
        }),
      ],
    });
    expect(furthestStageCounts(data)).toEqual([
      { stage: 'applied', count: 1 },
      { stage: 'interview', count: 1 },
    ]);
  });
});

describe('plans', () => {
  it('odd numbers read as absent', () => {
    const data = snap({
      weeklyReviews: [
        plan('p1', '2026-01-01', { outreachTarget: -3, applicationCap: '5' }),
      ],
    });
    const got = planFor(data, MON);
    expect(got.outreachTarget).toBeUndefined();
    expect(got.applicationCap).toBeUndefined();
    expect(got.record?.id).toBe('p1');
  });

  it('first created wins and setPlanOps deletes the second', () => {
    const data = snap({
      weeklyReviews: [
        plan('p2', '2026-02-01', { outreachTarget: 9 }),
        plan('p1', '2026-01-01', { outreachTarget: 4, applicationCap: 3 }),
      ],
    });
    expect(planFor(data, MON)).toMatchObject({
      outreachTarget: 4,
      applicationCap: 3,
    });
    expect(
      setPlanOps(
        data,
        MON,
        { outreachTarget: 4, applicationCap: 3 },
        fixedDeps(),
      ),
    ).toEqual([{ kind: 'delete', store: 'weeklyReviews', id: 'p2' }]);
    const ops = setPlanOps(data, MON, { outreachTarget: 6 }, fixedDeps());
    expect(ops).toEqual([
      {
        kind: 'put',
        store: 'weeklyReviews',
        record: {
          id: 'p1',
          createdAt: '2026-01-01',
          weekStart: MON,
          outreachTarget: 6,
        },
      },
      { kind: 'delete', store: 'weeklyReviews', id: 'p2' },
    ]);
  });

  it('setPlanOps creates, no-ops, and clears', () => {
    expect(setPlanOps(snap(), MON, {}, fixedDeps())).toEqual([]);
    const [put] = setPlanOps(snap(), MON, { applicationCap: 0 }, fixedDeps());
    expect(put).toMatchObject({
      kind: 'put',
      store: 'weeklyReviews',
      record: { id: 'id-1', weekStart: MON, applicationCap: 0 },
    });
    const data = snap({
      weeklyReviews: [plan('p1', '2026-01-01', { outreachTarget: 4 })],
    });
    expect(setPlanOps(data, MON, { outreachTarget: 4 }, fixedDeps())).toEqual(
      [],
    );
    expect(setPlanOps(data, MON, {}, fixedDeps())).toEqual([
      { kind: 'delete', store: 'weeklyReviews', id: 'p1' },
    ]);
  });

  it('parsePlanNumber', () => {
    expect(parsePlanNumber('')).toBeUndefined();
    expect(parsePlanNumber('5')).toBe(5);
    expect(parsePlanNumber('0')).toBe(0);
    expect(parsePlanNumber('-1')).toBe('invalid');
    expect(parsePlanNumber('2.5')).toBe('invalid');
    expect(parsePlanNumber('1000')).toBe('invalid');
  });

  it('capNote', () => {
    const c = (applications: number) => ({
      outreach: 0,
      conversations: 0,
      applications,
      followUps: 0,
    });
    expect(capNote(c(6), 5)).toBe(
      '6 applications this week, above your plan of 5. This is a note, not a limit.',
    );
    expect(capNote(c(5), 5)).toBeUndefined();
    expect(capNote(c(6), undefined)).toBeUndefined();
    expect(capNote(c(1), 0)).toBe(
      '1 application this week, above your plan of 0. This is a note, not a limit.',
    );
  });
});
