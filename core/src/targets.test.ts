import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import {
  flagTargetByNameOps,
  isTarget,
  setTargetOps,
  targetCompanies,
  type TargetRow,
} from './targets';
import type { WriteOp } from './repository';
import type { Company, Contact, Job, Snapshot } from './types';

const T = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

function snap(parts: {
  companies?: Company[];
  jobs?: Job[];
  contacts?: Contact[];
}): Snapshot {
  return {
    companies: parts.companies ?? [],
    jobs: parts.jobs ?? [],
    contacts: parts.contacts ?? [],
  } as unknown as Snapshot;
}

function rowFor(rows: TargetRow[], id: string): TargetRow {
  const row = rows.find((r) => r.company.id === id);
  if (!row) throw new Error(`no target row for ${id}`);
  return row;
}

function putRecord(ops: WriteOp[]): Company {
  const op = ops[0];
  if (ops.length !== 1 || !op || op.kind !== 'put') {
    throw new Error('expected exactly one put');
  }
  return op.record;
}

describe('isTarget', () => {
  it('is true only when the stored value is exactly true', () => {
    expect(isTarget({ id: 'c1', createdAt: T, isTarget: true })).toBe(true);
    expect(
      isTarget({
        id: 'c1',
        createdAt: T,
        isTarget: 'yes',
      } as unknown as Company),
    ).toBe(false);
    expect(isTarget({ id: 'c1', createdAt: T })).toBe(false);
  });
});

describe('flagTargetByNameOps', () => {
  it('one company however it is typed', () => {
    const existing: Company = {
      id: 'c1',
      createdAt: T,
      name: 'Example Robotics',
    };
    const data = snap({ companies: [existing] });

    const ops = flagTargetByNameOps(data, ' example  robotics ', fixedDeps());
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'put', store: 'companies' });
    const record = putRecord(ops);
    expect(record.id).toBe('c1');
    expect(record.name).toBe('Example Robotics');
    expect(record.isTarget).toBe(true);
    expect(existing).toEqual({
      id: 'c1',
      createdAt: T,
      name: 'Example Robotics',
    });

    const flagged = snap({ companies: [{ ...existing, isTarget: true }] });
    expect(
      flagTargetByNameOps(flagged, 'Example Robotics', fixedDeps()),
    ).toEqual([]);
  });

  it('creates a new name already flagged, as one put', () => {
    const ops = flagTargetByNameOps(snap({}), '  Sample   Labs ', fixedDeps());
    expect(ops).toHaveLength(1);
    const record = putRecord(ops);
    expect(record).toEqual({
      id: 'id-1',
      createdAt: '2026-01-05T09:00:00.000Z',
      name: 'Sample Labs',
      isTarget: true,
    });
  });

  it('throws on a blank or whitespace name', () => {
    expect(() => flagTargetByNameOps(snap({}), '', fixedDeps())).toThrow(
      'Enter a company name.',
    );
    expect(() => flagTargetByNameOps(snap({}), '   ', fixedDeps())).toThrow(
      'Enter a company name.',
    );
  });
});

describe('setTargetOps', () => {
  it('removes the isTarget field rather than setting it false', () => {
    const company: Company = {
      id: 'c1',
      createdAt: T,
      name: 'Example Robotics',
      isTarget: true,
    };
    const ops = setTargetOps(company, false);
    const record = putRecord(ops);
    expect(record).toEqual({
      id: 'c1',
      createdAt: T,
      name: 'Example Robotics',
    });
    expect('isTarget' in record).toBe(false);
    expect(company.isTarget).toBe(true);
  });

  it('gives no ops when the flag is unchanged', () => {
    const flagged: Company = { id: 'c1', createdAt: T, isTarget: true };
    const plain: Company = { id: 'c2', createdAt: T };
    expect(setTargetOps(flagged, true)).toEqual([]);
    expect(setTargetOps(plain, false)).toEqual([]);
  });

  it('sets the flag on an unflagged company', () => {
    const plain: Company = { id: 'c2', createdAt: T, name: 'Sample Labs' };
    const record = putRecord(setTargetOps(plain, true));
    expect(record).toEqual({
      id: 'c2',
      createdAt: T,
      name: 'Sample Labs',
      isTarget: true,
    });
    expect('isTarget' in plain).toBe(false);
  });
});

describe('targetCompanies', () => {
  const companies: Company[] = [
    { id: 'c9', createdAt: T, isTarget: true },
    { id: 'c2', createdAt: T, name: 'sample labs', isTarget: true },
    { id: 'c1', createdAt: T, name: 'Example Robotics', isTarget: true },
    { id: 'c3', createdAt: T, name: 'Other Co' },
    {
      id: 'c4',
      createdAt: T,
      name: 'Fake Yes',
      isTarget: 'yes',
    } as unknown as Company,
  ];
  const jobs: Job[] = [
    { id: 'j1', createdAt: T, companyName: 'EXAMPLE ROBOTICS', title: 'Old' },
    {
      id: 'j2',
      createdAt: LATER,
      companyName: 'Example  Robotics',
      title: 'New',
    },
    { id: 'j3', createdAt: LATER, companyName: 'Other Co', title: 'Elsewhere' },
    {
      id: 'j4',
      createdAt: LATER,
      companyName: 42,
      title: 'Odd',
    } as unknown as Job,
  ];
  const contacts: Contact[] = [
    { id: 'k1', createdAt: T, companyId: 'c1', name: 'Ada Example' },
    { id: 'k2', createdAt: T, companyId: 'c3', name: 'Not Here' },
  ];

  it('lists flagged companies only, by name then id, nameless last', () => {
    const rows = targetCompanies(snap({ companies, jobs, contacts }));
    expect(rows.map((r) => r.company.id)).toEqual(['c1', 'c2', 'c9']);
  });

  it('matches jobs by normalised name, newest first, and excludes other companies', () => {
    const rows = targetCompanies(snap({ companies, jobs, contacts }));
    expect(rowFor(rows, 'c1').jobs.map((j) => j.id)).toEqual(['j2', 'j1']);
    expect(rowFor(rows, 'c2').jobs).toEqual([]);
    expect(rowFor(rows, 'c9').jobs).toEqual([]);
  });

  it('attaches the contacts of each target', () => {
    const rows = targetCompanies(snap({ companies, jobs, contacts }));
    expect(rowFor(rows, 'c1').contacts.map((c) => c.id)).toEqual(['k1']);
    expect(rowFor(rows, 'c2').contacts).toEqual([]);
  });

  it('tolerates odd stored types without throwing', () => {
    expect(() =>
      targetCompanies(snap({ companies, jobs, contacts })),
    ).not.toThrow();
  });
});
