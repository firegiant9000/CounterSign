import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { deadlines } from './deadlines';
import { emptySnapshot } from './schema';
import {
  completeTaskOps,
  deleteTaskOps,
  doneTasks,
  newTaskOps,
  reopenTaskOps,
} from './tasks';
import type { Application, Deps, Snapshot, StatusEvent, Task } from './types';

const TODAY = '2026-11-16';

function at(day: string): string {
  return `${day}T12:00:00.000Z`;
}

const deps: Deps = { now: () => at('2026-11-16'), newId: () => 'new1' };

function task(id: string, extra: Record<string, unknown> = {}): Task {
  return { id, createdAt: at('2026-11-01'), ...extra };
}

function app(id: string, extra: Partial<Application> = {}): Application {
  return {
    id,
    createdAt: at('2026-01-01'),
    companyId: 'c1',
    title: `Role ${id}`,
    ...extra,
  };
}

function ev(
  id: string,
  applicationId: string,
  status: StatusEvent['status'],
  day: string,
): StatusEvent {
  return { id, createdAt: at(day), applicationId, status, occurredOn: day };
}

function snap(parts: Partial<Snapshot>): Snapshot {
  return {
    ...emptySnapshot(),
    companies: [{ id: 'c1', createdAt: at('2026-01-01'), name: 'Example Co' }],
    ...parts,
  };
}

describe('addDays', () => {
  it('adds calendar days', () => {
    expect(addDays('2026-11-16', 3)).toBe('2026-11-19');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('x', 1)).toBeUndefined();
  });
});

describe('task ops', () => {
  it('trims the title and drops a blank due date', () => {
    const { ops, taskId } = newTaskOps(
      { title: '  Call back  ', dueOn: '' },
      deps,
    );
    expect(taskId).toBe('new1');
    expect(ops).toHaveLength(1);
    const op = ops[0];
    if (op?.kind !== 'put' || op.store !== 'tasks') throw new Error('bad op');
    expect(op.record.title).toBe('Call back');
    expect('dueOn' in op.record).toBe(false);
  });

  it('keeps a valid due date', () => {
    const { ops } = newTaskOps({ title: 'x', dueOn: '2026-11-20' }, deps);
    const op = ops[0];
    if (op?.kind !== 'put' || op.store !== 'tasks') throw new Error('bad op');
    expect(op.record.dueOn).toBe('2026-11-20');
  });

  it('completes once, reopens, and deletes', () => {
    const open = task('t1', { title: 'a' });
    const first = completeTaskOps(open, deps);
    expect(first).toHaveLength(1);
    const op = first[0];
    if (op?.kind !== 'put' || op.store !== 'tasks') throw new Error('bad op');
    expect(op.record.doneAt).toBe(at('2026-11-16'));
    expect(completeTaskOps(op.record, deps)).toEqual([]);
    const reopened = reopenTaskOps(op.record)[0];
    if (reopened?.kind !== 'put' || reopened.store !== 'tasks') {
      throw new Error('bad op');
    }
    expect('doneAt' in reopened.record).toBe(false);
    expect(reopenTaskOps(open)).toEqual([]);
    expect(deleteTaskOps('t1')).toEqual([
      { kind: 'delete', store: 'tasks', id: 't1' },
    ]);
  });

  it('lists done tasks newest first and skips doneAt: false', () => {
    const data = snap({
      tasks: [
        task('a', { doneAt: at('2026-11-10') }),
        task('b', { doneAt: at('2026-11-12') }),
        task('c', { doneAt: false }),
        task('d'),
      ],
    });
    expect(doneTasks(data).map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('deadlines', () => {
  it('sorts by date with undated last', () => {
    const data = snap({
      tasks: [
        task('t1', { title: 'Due', dueOn: '2026-11-20' }),
        task('t2', { title: 'Someday' }),
      ],
      applications: [app('a1', { nextActionDate: '2026-11-17' })],
    });
    expect(deadlines(data, {}, TODAY).map((r) => r.key)).toEqual([
      'next_action:a1',
      'task:t1',
      'task:t2',
    ]);
  });

  it('flags overdue', () => {
    const data = snap({
      applications: [
        app('a1', { nextActionDate: '2026-11-15' }),
        app('a2', { nextActionDate: '2026-11-16' }),
      ],
    });
    const rows = deadlines(data, {}, TODAY);
    expect(rows.find((r) => r.key === 'next_action:a1')?.overdue).toBe(true);
    expect(rows.find((r) => r.key === 'next_action:a2')?.overdue).toBe(false);
  });

  it('skips archived and done', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: '2026-11-17' })],
      statusEvents: [ev('e1', 'a1', 'rejected', '2026-11-01')],
      tasks: [task('t1', { title: 'x', doneAt: at('2026-11-10') })],
    });
    expect(deadlines(data, {}, TODAY)).toEqual([]);
  });

  it('quiet row dates from the cut-off', () => {
    const data = snap({
      applications: [app('a1')],
      statusEvents: [ev('e1', 'a1', 'applied', '2026-10-01')],
    });
    const rows = deadlines(data, { noResponseDays: 30 }, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'quiet',
      date: '2026-11-01',
      overdue: true,
      actor: 'me',
      applicationId: 'a1',
      label: 'Example Co — Role a1: quiet for 46 days',
    });
    expect(deadlines(data, { noResponseDays: 60 }, TODAY)).toEqual([]);
  });

  it('shows both reasons for one application', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: '2026-11-18' })],
      statusEvents: [ev('e1', 'a1', 'applied', '2026-10-01')],
    });
    const rows = deadlines(data, { noResponseDays: 30 }, TODAY);
    expect(rows.map((r) => r.key)).toEqual(['quiet:a1', 'next_action:a1']);
  });

  it('orders ties on one date as task, next_action, quiet', () => {
    const data = snap({
      applications: [app('a1', { nextActionDate: '2026-11-01' }), app('a2')],
      statusEvents: [ev('e1', 'a2', 'applied', '2026-10-01')],
      tasks: [task('t1', { title: 'z', dueOn: '2026-11-01' })],
    });
    expect(
      deadlines(data, { noResponseDays: 30 }, TODAY).map((r) => r.kind),
    ).toEqual(['task', 'next_action', 'quiet']);
  });

  it('builds labels and actors defensively', () => {
    const data = snap({
      companies: [],
      applications: [
        {
          id: 'a1',
          createdAt: at('2026-01-01'),
          nextActionDate: '2026-11-17',
          nextActor: 'boss',
        } as unknown as Application,
      ],
      tasks: [task('t1', { title: '  ' }), task('t2')],
    });
    const rows = deadlines(data, {}, TODAY);
    const next = rows.find((r) => r.kind === 'next_action');
    expect(next?.label).toBe('Unknown company — Untitled');
    expect(next && 'actor' in next).toBe(false);
    expect(rows.filter((r) => r.kind === 'task').map((r) => r.label)).toEqual([
      'Untitled task',
      'Untitled task',
    ]);
  });

  it('treats odd restored values as undated or open', () => {
    const data = snap({
      tasks: [
        task('t1', { title: 'a', dueOn: 'soon' }),
        task('t2', { title: 'b', doneAt: false }),
      ],
    });
    const rows = deadlines(data, {}, TODAY);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.date === undefined && !r.overdue)).toBe(true);
  });
});
