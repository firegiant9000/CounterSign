import { describe, expect, it } from 'vitest';
import { applicationRows, filterRows } from './application-list';
import type { StatusKey } from './status';
import { emptySnapshot } from './schema';
import type { Application, Snapshot, StatusEvent } from './types';

const T = '2026-01-05T09:00:00.000Z';

function ids(rows: readonly { id: string }[]): string[] {
  return rows.map((r) => r.id);
}

describe('applicationRows', () => {
  it('joins company, title and status into a row', () => {
    const data: Snapshot = {
      ...emptySnapshot(),
      companies: [{ id: 'c1', createdAt: T, name: 'Example Robotics' }],
      applications: [
        {
          id: 'a1',
          createdAt: T,
          companyId: 'c1',
          title: 'Staff Engineer',
          notes: 'Remote',
          url: 'https://example.com/jobs/1',
          nextActionDate: '2026-02-01',
          nextActor: 'them',
        },
      ],
      statusEvents: [
        {
          id: 's1',
          createdAt: T,
          applicationId: 'a1',
          status: 'applied',
          occurredOn: '2026-01-06',
        },
      ],
    };
    expect(applicationRows(data)).toEqual([
      {
        id: 'a1',
        companyName: 'Example Robotics',
        title: 'Staff Engineer',
        notes: 'Remote',
        url: 'https://example.com/jobs/1',
        status: 'applied',
        statusLabel: 'Applied',
        statusDate: '2026-01-06',
        nextActionDate: '2026-02-01',
        nextActor: 'them',
        archived: false,
        createdAt: T,
      },
    ]);
  });

  it('survives missing links', () => {
    const data = {
      ...emptySnapshot(),
      applications: [{ id: 'a1', createdAt: T, companyId: 'gone' }],
    };
    const rows = applicationRows(data);
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'a1',
        companyName: '',
        title: '',
        notes: '',
        statusLabel: 'No status',
        archived: false,
      }),
    ]);
    expect(rows[0]).not.toHaveProperty('url');
    expect(rows[0]).not.toHaveProperty('nextActionDate');
    expect(rows[0]).not.toHaveProperty('nextActor');
    expect(rows[0]).not.toHaveProperty('status');
    expect(rows[0]).not.toHaveProperty('statusDate');

    const nameless = {
      ...emptySnapshot(),
      companies: [{ id: 'c2', createdAt: T }],
      applications: [{ id: 'a2', createdAt: T, companyId: 'c2' }],
    };
    expect(applicationRows(nameless)[0]?.companyName).toBe('');
  });

  it('shows an unknown status key as it is', () => {
    const event = {
      id: 's1',
      createdAt: T,
      applicationId: 'a1',
      status: 'on_hold',
    } as unknown as StatusEvent;
    const data: Snapshot = {
      ...emptySnapshot(),
      applications: [{ id: 'a1', createdAt: T }],
      statusEvents: [event],
    };
    expect(applicationRows(data)).toEqual([
      expect.objectContaining({
        status: 'on_hold',
        statusLabel: 'on_hold',
        archived: false,
      }),
    ]);
  });

  it('ignores a status event whose application is gone', () => {
    const data: Snapshot = {
      ...emptySnapshot(),
      applications: [{ id: 'a1', createdAt: T }],
      statusEvents: [
        { id: 's1', createdAt: T, applicationId: 'gone', status: 'applied' },
        { id: 's2', createdAt: T, applicationId: 'a1', status: 'interview' },
      ],
    };
    const rows = applicationRows(data);
    expect(ids(rows)).toEqual(['a1']);
    expect(rows[0]?.status).toBe('interview');
  });

  it('sorts dated next actions first, then newest; breaks exact ties by id; leaves input unmutated', () => {
    const apps: Application[] = [
      { id: 'a1', createdAt: T, nextActionDate: '2026-03-10' },
      {
        id: 'a2',
        createdAt: '2026-01-02T09:00:00.000Z',
        nextActionDate: '2026-02-01',
      },
      { id: 'a3', createdAt: '2026-01-03T09:00:00.000Z' },
      { id: 'a4', createdAt: '2026-01-04T09:00:00.000Z' },
      {
        id: 'a5',
        createdAt: '2026-01-06T09:00:00.000Z',
        nextActionDate: '2026-02-01',
      },
      { id: 'z-tie', createdAt: '2026-01-08T09:00:00.000Z' },
      { id: 'm-tie', createdAt: '2026-01-08T09:00:00.000Z' },
    ];
    const data: Snapshot = { ...emptySnapshot(), applications: apps };
    const inputOrder = ids(apps);

    const rows = applicationRows(data);
    expect(ids(rows)).toEqual(['a5', 'a2', 'a1', 'm-tie', 'z-tie', 'a4', 'a3']);
    expect(ids(data.applications)).toEqual(inputOrder);
    expect(data.applications).toBe(apps);
  });

  it('hides archived rows by default', () => {
    const data: Snapshot = {
      ...emptySnapshot(),
      applications: [
        { id: 'a1', createdAt: T },
        { id: 'a2', createdAt: '2026-01-06T09:00:00.000Z' },
        { id: 'a3', createdAt: '2026-01-07T09:00:00.000Z' },
      ],
      statusEvents: [
        { id: 's1', createdAt: T, applicationId: 'a1', status: 'applied' },
        { id: 's2', createdAt: T, applicationId: 'a2', status: 'rejected' },
      ],
    };
    const rows = applicationRows(data);
    expect(ids(filterRows(rows, {}))).toEqual(['a3', 'a1']);
    expect(ids(filterRows(rows, { scope: 'active' }))).toEqual(['a3', 'a1']);
    expect(ids(filterRows(rows, { scope: 'archived' }))).toEqual(['a2']);
    expect(ids(filterRows(rows, { scope: 'all' }))).toEqual(['a3', 'a2', 'a1']);
  });

  it('matches every search term across company, title and notes', () => {
    const data: Snapshot = {
      ...emptySnapshot(),
      companies: [{ id: 'c1', createdAt: T, name: 'Example Robotics' }],
      applications: [
        {
          id: 'a1',
          createdAt: T,
          companyId: 'c1',
          title: 'Staff Engineer',
          notes: 'Remote, hybrid',
        },
        { id: 'a2', createdAt: '2026-01-06T09:00:00.000Z', title: 'Baker' },
      ],
    };
    const rows = applicationRows(data);
    expect(ids(filterRows(rows, { query: 'robotics engineer' }))).toEqual([
      'a1',
    ]);
    expect(ids(filterRows(rows, { query: 'ROBOTICS' }))).toEqual(['a1']);
    expect(ids(filterRows(rows, { query: 'hybrid remote' }))).toEqual(['a1']);
    expect(ids(filterRows(rows, { query: 'robotics designer' }))).toEqual([]);
    expect(ids(filterRows(rows, { query: '   ' }))).toEqual(['a2', 'a1']);
    expect(ids(filterRows(rows, { query: '  baker  ' }))).toEqual(['a2']);
  });

  it('filters by status key', () => {
    const statuses: StatusKey[] = ['applied', 'interview', 'applied'];
    const data: Snapshot = {
      ...emptySnapshot(),
      applications: [
        { id: 'a1', createdAt: T },
        { id: 'a2', createdAt: '2026-01-06T09:00:00.000Z' },
        { id: 'a3', createdAt: '2026-01-07T09:00:00.000Z' },
      ],
      statusEvents: statuses.map((status, i) => ({
        id: `s${i + 1}`,
        createdAt: T,
        applicationId: `a${i + 1}`,
        status,
      })),
    };
    const rows = applicationRows(data);
    expect(ids(filterRows(rows, { status: 'applied' }))).toEqual(['a3', 'a1']);
    expect(ids(filterRows(rows, { status: 'interview' }))).toEqual(['a2']);
    expect(ids(filterRows(rows, { status: 'offer' }))).toEqual([]);
  });
});
