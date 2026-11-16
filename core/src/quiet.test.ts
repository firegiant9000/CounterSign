import { describe, expect, it } from 'vitest';
import { daysBetween } from './dates';
import { closeAsNoResponseOps, quietApplications } from './quiet';
import { createMemoryRepository } from './memory-repository';
import { emptySnapshot } from './schema';
import type { StatusKey } from './status';
import type { Deps, Snapshot, StatusEvent } from './types';

const TODAY = '2026-11-15';

function at(day: string): string {
  return `${day}T12:00:00.000Z`;
}

function ev(
  id: string,
  applicationId: string,
  status: StatusKey,
  day: string | undefined,
  extra: Partial<StatusEvent> = {},
): StatusEvent {
  const event: StatusEvent = {
    id,
    createdAt: at(day ?? '2026-01-01'),
    applicationId,
    status,
    ...extra,
  };
  if (day !== undefined) event.occurredOn = day;
  return event;
}

function snap(events: StatusEvent[], appIds: string[] = ['a1']): Snapshot {
  return {
    ...emptySnapshot(),
    companies: [{ id: 'c1', createdAt: at('2026-01-01'), name: 'Example Co' }],
    applications: appIds.map((id) => ({
      id,
      createdAt: at('2026-01-01'),
      companyId: 'c1',
      title: `Role ${id}`,
    })),
    statusEvents: events,
  };
}

function ids(data: Snapshot, cutoff = 30): string[] {
  return quietApplications(data, cutoff, TODAY).map((r) => r.id);
}

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-10-16', '2026-11-15')).toBe(30);
    expect(daysBetween('2026-11-15', '2026-11-15')).toBe(0);
    expect(daysBetween('2026-11-15', '2026-11-14')).toBe(-1);
  });
  it('is unaffected by DST changes and leap days', () => {
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2026-10-25', '2026-11-02')).toBe(8);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });
  it('is undefined for invalid dates', () => {
    expect(daysBetween('x', TODAY)).toBeUndefined();
    expect(daysBetween(TODAY, '2026-02-30')).toBeUndefined();
  });
});

describe('quietApplications', () => {
  it('boundary', () => {
    expect(ids(snap([ev('s1', 'a1', 'applied', '2026-10-16')]))).toEqual([]);
    const rows = quietApplications(
      snap([ev('s1', 'a1', 'applied', '2026-10-15')]),
      30,
      TODAY,
    );
    expect(rows.map((r) => r.id)).toEqual(['a1']);
    expect(rows[0]?.quietDays).toBe(31);
    expect(rows[0]?.statusDate).toBe('2026-10-15');
  });

  it('a later event resets it', () => {
    expect(
      ids(
        snap([
          ev('s1', 'a1', 'applied', '2026-09-01'),
          ev('s2', 'a1', 'phone_screen', '2026-10-01'),
        ]),
      ),
    ).toEqual([]);
    expect(
      ids(
        snap([
          ev('s1', 'a1', 'applied', '2026-09-01'),
          ev('s2', 'a1', 'applied', '2026-11-01'),
        ]),
      ),
    ).toEqual([]);
  });

  it('voided events are ignored', () => {
    expect(
      ids(
        snap([
          ev('s1', 'a1', 'applied', '2026-09-01'),
          ev('s2', 'a1', 'phone_screen', '2026-10-01', {
            voidedAt: at('2026-10-02'),
          }),
        ]),
      ),
    ).toEqual(['a1']);
  });

  it('counts the creation day when there is no occurredOn', () => {
    const data = snap([ev('s1', 'a1', 'applied', undefined)]);
    expect(quietApplications(data, 30, TODAY)[0]?.statusDate).toBe(
      '2026-01-01',
    );
  });

  it('treats an invalid cut-off as 30', () => {
    const data = snap([ev('s1', 'a1', 'applied', '2026-10-15')]);
    const fresh = snap([ev('s1', 'a1', 'applied', '2026-10-16')]);
    for (const cutoff of [0, -5, 2.5]) {
      expect(ids(data, cutoff)).toEqual(['a1']);
      expect(ids(fresh, cutoff)).toEqual([]);
    }
  });

  it('honours a valid cut-off', () => {
    const data = snap([ev('s1', 'a1', 'applied', '2026-11-05')]);
    expect(ids(data, 10)).toEqual([]);
    expect(ids(data, 9)).toEqual(['a1']);
  });

  it('does not throw on odd data', () => {
    const data: Snapshot = {
      ...snap([
        ev('s1', 'ghost', 'applied', '2026-01-01'),
        ev('s2', 'a1', 'applied', '2026-01-01'),
        ev('s3', 'a2', 'applied', 'not-a-date'),
      ]),
    };
    data.applications.push({ id: 'a2', createdAt: at('2026-01-01') });
    data.applications.push({
      id: 'a3',
      createdAt: at('2026-01-01'),
      companyId: 'missing',
    });
    expect(ids(data)).toEqual(['a1']);
  });

  it('sorts oldest first, then by id', () => {
    const data = snap(
      [
        ev('s1', 'b', 'applied', '2026-05-01'),
        ev('s2', 'a', 'applied', '2026-05-01'),
        ev('s3', 'c', 'applied', '2026-04-01'),
      ],
      ['a', 'b', 'c'],
    );
    expect(ids(data)).toEqual(['c', 'a', 'b']);
  });
});

describe('closeAsNoResponseOps', () => {
  function deps(): Deps {
    let n = 0;
    return {
      now: () => at(TODAY),
      newId: () => `new${String((n += 1))}`,
    };
  }

  it('closes only what is still applied', () => {
    const data = snap(
      [
        ev('s1', 'a1', 'applied', '2026-09-01'),
        ev('s2', 'a2', 'applied', '2026-09-01'),
        ev('s3', 'a2', 'rejected', '2026-09-10'),
        ev('s4', 'a3', 'applied', '2026-09-01'),
      ],
      ['a1', 'a2'],
    );
    const ops = closeAsNoResponseOps(
      data,
      ['a1', 'a2', 'a3', 'a1'],
      TODAY,
      deps(),
    );
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op?.kind).toBe('put');
    expect(op?.store).toBe('statusEvents');
    expect(op?.kind === 'put' ? op.record : undefined).toMatchObject({
      applicationId: 'a1',
      status: 'no_response',
      occurredOn: TODAY,
    });
  });

  it('closing twice writes nothing the second time', async () => {
    const repo = createMemoryRepository();
    const data = snap([ev('s1', 'a1', 'applied', '2026-09-01')]);
    await repo.replaceAll(data);
    const first = closeAsNoResponseOps(data, ['a1'], TODAY, deps());
    expect(first).toHaveLength(1);
    await repo.apply(first);
    const after = await repo.snapshot();
    expect(closeAsNoResponseOps(after, ['a1'], TODAY, deps())).toEqual([]);
  });
});
