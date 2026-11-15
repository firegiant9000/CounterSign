import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { STORES, SCHEMA_VERSION, emptySnapshot } from '../../core/src/schema';
import type { Company, Snapshot } from '../../core/src/types';
import { describeRepositoryContract } from '../../core/testing/repository-contract';
import { openIdbRepository } from './idb-repository';

const T = '2026-01-05T09:00:00.000Z';
let n = 0;
function freshName(): string {
  return `test-db-${n++}`;
}

describeRepositoryContract('indexeddb', () =>
  openIdbRepository({ dbName: freshName() }),
);

function rawOpen(
  dbName: string,
  version?: number,
  onUpgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = () => onUpgrade?.(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('open failed'));
  });
}

describe('indexeddb repository', () => {
  it('keeps records after the database is reopened', async () => {
    const dbName = freshName();
    const first = await openIdbRepository({ dbName });
    await first.apply([
      {
        kind: 'put',
        store: 'companies',
        record: { id: 'c1', createdAt: '2026-01-05T09:00:00.000Z' },
      },
    ]);
    const second = await openIdbRepository({ dbName });
    const snap = await second.snapshot();
    expect(snap.companies.map((c) => c.id)).toEqual(['c1']);
  });

  it('creates every store in STORES', async () => {
    const dbName = freshName();
    await openIdbRepository({ dbName });
    const db = await rawOpen(dbName);
    const names = Array.from(db.objectStoreNames).sort();
    db.close();
    expect(names).toEqual(STORES.map((s) => s.name).sort());
  });

  it('keeps the original data when replaceAll cannot store a record', async () => {
    const repo = await openIdbRepository({ dbName: freshName() });
    await repo.apply([
      { kind: 'put', store: 'companies', record: { id: 'c1', createdAt: T } },
      { kind: 'put', store: 'companies', record: { id: 'c2', createdAt: T } },
    ]);
    const bad = {
      ...emptySnapshot(),
      companies: [{ id: 'c9', createdAt: T, run: () => undefined }],
    } as unknown as Snapshot;
    await expect(repo.replaceAll(bad)).rejects.toThrow();
    const snap = await repo.snapshot();
    expect(snap.companies.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('keeps the original data when apply cannot store a record', async () => {
    const repo = await openIdbRepository({ dbName: freshName() });
    await repo.apply([
      { kind: 'put', store: 'companies', record: { id: 'c1', createdAt: T } },
      { kind: 'put', store: 'companies', record: { id: 'c2', createdAt: T } },
    ]);
    const bad = {
      id: 'c9',
      createdAt: T,
      run: () => undefined,
    } as unknown as Company;
    await expect(
      repo.apply([
        { kind: 'put', store: 'companies', record: { id: 'c3', createdAt: T } },
        { kind: 'put', store: 'companies', record: bad },
      ]),
    ).rejects.toThrow();
    const snap = await repo.snapshot();
    expect(snap.companies.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('explains a database written by a newer version', async () => {
    const dbName = freshName();
    const db = await rawOpen(dbName, SCHEMA_VERSION + 1);
    db.close();
    await expect(openIdbRepository({ dbName })).rejects.toThrow(
      'This data was written by a newer version of Countersign.',
    );
  });
});
