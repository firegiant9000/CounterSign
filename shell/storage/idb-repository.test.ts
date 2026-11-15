import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { STORES, SCHEMA_VERSION } from '../../core/src/schema';
import { describeRepositoryContract } from '../../core/testing/repository-contract';
import { openIdbRepository } from './idb-repository';

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

  it('explains a database written by a newer version', async () => {
    const dbName = freshName();
    const db = await rawOpen(dbName, SCHEMA_VERSION + 1);
    db.close();
    await expect(openIdbRepository({ dbName })).rejects.toThrow(
      'This data was written by a newer version of Countersign.',
    );
  });
});
