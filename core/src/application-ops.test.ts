import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import {
  addStatusEventOps,
  deleteApplicationOps,
  findCompanyByName,
  newApplicationOps,
  updateApplicationOps,
  voidStatusEventOps,
} from './application-ops';
import { emptySnapshot } from './schema';
import type { Application, Company, StatusEvent } from './types';

const T = '2026-01-05T09:00:00.000Z';

function putRecord<S extends string>(
  ops: { kind: string; store: string; record?: unknown }[],
  store: S,
) {
  const op = ops.find((o) => o.kind === 'put' && o.store === store);
  return op?.record as Record<string, unknown> | undefined;
}

describe('findCompanyByName', () => {
  it('matches after trim, whitespace collapse and case folding, and tolerates nameless companies', () => {
    const companies: Company[] = [
      { id: 'c0', createdAt: T },
      { id: 'c1', createdAt: T, name: 'Example Robotics' },
    ];
    expect(findCompanyByName(companies, '  example   ROBOTICS ')?.id).toBe(
      'c1',
    );
    expect(findCompanyByName(companies, 'Other')).toBeUndefined();
  });
});

describe('newApplicationOps', () => {
  it('creates the company, the application and the first status event together', () => {
    const { ops, applicationId } = newApplicationOps(
      {
        companyName: 'Example Robotics',
        title: 'Engineer',
        url: 'https://example.com/jobs/1',
        status: 'applied',
        occurredOn: '2026-03-02',
      },
      emptySnapshot(),
      fixedDeps(),
    );
    expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual([
      'put:companies',
      'put:applications',
      'put:statusEvents',
    ]);
    const company = putRecord(ops, 'companies');
    const app = putRecord(ops, 'applications');
    const event = putRecord(ops, 'statusEvents');
    expect(company?.name).toBe('Example Robotics');
    expect(app?.companyId).toBe(company?.id);
    expect(app?.id).toBe(applicationId);
    expect(app?.title).toBe('Engineer');
    expect(app?.url).toBe('https://example.com/jobs/1');
    expect(event?.applicationId).toBe(applicationId);
    expect(event?.status).toBe('applied');
    expect(event?.occurredOn).toBe('2026-03-02');
    expect(typeof event?.createdAt).toBe('string');
  });

  it('reuses a company whatever the case and spacing', () => {
    const data = {
      ...emptySnapshot(),
      companies: [{ id: 'c1', createdAt: T, name: 'Example Robotics' }],
    };
    const { ops } = newApplicationOps(
      { companyName: '  example   robotics ' },
      data,
      fixedDeps(),
    );
    expect(ops.some((o) => o.store === 'companies')).toBe(false);
    expect(putRecord(ops, 'applications')?.companyId).toBe('c1');
  });

  it('stores a new company with trimmed, collapsed whitespace', () => {
    const { ops } = newApplicationOps(
      { companyName: '  Example   Robotics ' },
      emptySnapshot(),
      fixedDeps(),
    );
    expect(putRecord(ops, 'companies')?.name).toBe('Example Robotics');
  });

  it('needs no fields at all', () => {
    const { ops } = newApplicationOps({}, emptySnapshot(), fixedDeps());
    expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual([
      'put:applications',
      'put:statusEvents',
    ]);
    expect(Object.keys(putRecord(ops, 'applications') ?? {})).toEqual([
      'id',
      'createdAt',
    ]);
    const event = putRecord(ops, 'statusEvents');
    expect(event?.status).toBe('interested');
    expect('occurredOn' in (event ?? {})).toBe(false);
    expect('note' in (event ?? {})).toBe(false);
  });

  it('drops blank strings and creates no company for a blank name', () => {
    const { ops } = newApplicationOps(
      {
        companyName: '  ',
        title: '   ',
        url: '',
        notes: ' \n',
        occurredOn: '  ',
      },
      emptySnapshot(),
      fixedDeps(),
    );
    expect(ops.some((o) => o.store === 'companies')).toBe(false);
    expect(Object.keys(putRecord(ops, 'applications') ?? {})).toEqual([
      'id',
      'createdAt',
    ]);
    expect('occurredOn' in (putRecord(ops, 'statusEvents') ?? {})).toBe(false);
  });

  it('keeps nextActionDate, nextActor and notes', () => {
    const { ops } = newApplicationOps(
      {
        nextActionDate: '2026-03-09',
        nextActor: 'them',
        notes: 'line one\n  line two',
      },
      emptySnapshot(),
      fixedDeps(),
    );
    const app = putRecord(ops, 'applications');
    expect(app?.nextActionDate).toBe('2026-03-09');
    expect(app?.nextActor).toBe('them');
    expect(app?.notes).toBe('line one\n  line two');
  });
});

describe('updateApplicationOps', () => {
  it('updates and clears fields without touching id or createdAt', () => {
    const app: Application = {
      id: 'a1',
      createdAt: T,
      notes: 'old',
      nextActionDate: '2026-03-09',
    };
    const ops = updateApplicationOps(app, {
      notes: 'new',
      nextActionDate: undefined,
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      kind: 'put',
      store: 'applications',
      record: { id: 'a1', createdAt: T, notes: 'new' },
    });
    expect(app.notes).toBe('old');
  });

  it('removes a key for a blank string and ignores smuggled id and createdAt', () => {
    const app: Application = {
      id: 'a1',
      createdAt: T,
      title: 'Engineer',
      notes: 'keep',
    };
    const patch = {
      title: '  ',
      id: 'zzz',
      createdAt: 'x',
    } as unknown as Parameters<typeof updateApplicationOps>[1];
    const [op] = updateApplicationOps(app, patch);
    expect(op).toEqual({
      kind: 'put',
      store: 'applications',
      record: { id: 'a1', createdAt: T, notes: 'keep' },
    });
  });
});

describe('addStatusEventOps', () => {
  it('adds a status event', () => {
    const ops = addStatusEventOps(
      'a1',
      { status: 'interview', occurredOn: '2026-03-05', note: 'phone screen' },
      fixedDeps(),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: 'put',
      store: 'statusEvents',
      record: {
        id: 'id-1',
        applicationId: 'a1',
        status: 'interview',
        occurredOn: '2026-03-05',
        note: 'phone screen',
      },
    });
  });

  it('omits a blank date and note', () => {
    const ops = addStatusEventOps(
      'a1',
      { status: 'applied', occurredOn: ' ', note: '' },
      fixedDeps(),
    );
    const record = putRecord(ops, 'statusEvents') ?? {};
    expect('occurredOn' in record).toBe(false);
    expect('note' in record).toBe(false);
  });
});

describe('voidStatusEventOps', () => {
  it('voids an event without changing anything else', () => {
    const event: StatusEvent = {
      id: 'e1',
      createdAt: T,
      applicationId: 'a1',
      status: 'applied',
      occurredOn: '2026-03-02',
    };
    const deps = fixedDeps();
    const ops = voidStatusEventOps(event, deps);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'put', store: 'statusEvents' });
    const record = (ops[0] as { record: StatusEvent }).record;
    expect(record).toEqual({ ...event, voidedAt: '2026-01-05T09:00:00.000Z' });
    expect(event.voidedAt).toBeUndefined();
  });
});

describe('deleteApplicationOps', () => {
  it('deletes an application and only its own events, voided or not', () => {
    const data = {
      ...emptySnapshot(),
      companies: [{ id: 'c1', createdAt: T, name: 'Example Robotics' }],
      applications: [
        { id: 'a1', createdAt: T, companyId: 'c1' },
        { id: 'a2', createdAt: T, companyId: 'c1' },
      ],
      statusEvents: [
        {
          id: 'e1',
          createdAt: T,
          applicationId: 'a1',
          status: 'applied' as const,
        },
        {
          id: 'e2',
          createdAt: T,
          applicationId: 'a1',
          status: 'interview' as const,
          voidedAt: T,
        },
        {
          id: 'e3',
          createdAt: T,
          applicationId: 'a2',
          status: 'applied' as const,
        },
      ],
      documents: [{ id: 'd1', createdAt: T, label: 'Resume' }],
    };
    expect(deleteApplicationOps(data, 'a1')).toEqual([
      { kind: 'delete', store: 'statusEvents', id: 'e1' },
      { kind: 'delete', store: 'statusEvents', id: 'e2' },
      { kind: 'delete', store: 'applications', id: 'a1' },
    ]);
  });
});

describe('odd restored records and update trimming', () => {
  it('findCompanyByName skips companies with a non-string name', () => {
    const data = {
      ...emptySnapshot(),
      companies: [
        { id: 'c0', createdAt: T, name: null },
        { id: 'c5', createdAt: T, name: 5 },
        { id: 'c1', createdAt: T, name: 'Example Robotics' },
      ],
    } as unknown as ReturnType<typeof emptySnapshot>;
    const result = newApplicationOps(
      { companyName: 'Example Robotics' },
      data,
      fixedDeps(),
    );
    expect(putRecord(result.ops, 'applications')?.['companyId']).toBe('c1');
    expect(putRecord(result.ops, 'companies')).toBeUndefined();
  });

  it('updateApplicationOps trims title and url like create does', () => {
    const app: Application = { id: 'a1', createdAt: T };
    const [op] = updateApplicationOps(app, {
      title: '  Staff Engineer ',
      url: ' https://example.com/j ',
    });
    expect(op).toEqual({
      kind: 'put',
      store: 'applications',
      record: {
        id: 'a1',
        createdAt: T,
        title: 'Staff Engineer',
        url: 'https://example.com/j',
      },
    });
  });
});
