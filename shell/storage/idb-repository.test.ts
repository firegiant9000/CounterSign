import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
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

  it('upgrades a version 1 database without losing records', async () => {
    const dbName = freshName();
    const company = {
      id: 'c1',
      createdAt: '2026-01-05T09:00:00.000Z',
      name: 'Example Robotics',
    };
    const application = {
      id: 'a1',
      createdAt: '2026-01-06T09:00:00.000Z',
      companyId: 'c1',
    };
    const v1 = await rawOpen(dbName, 1, (db) => {
      for (const { name, since } of STORES) {
        if (since === 1) db.createObjectStore(name, { keyPath: 'id' });
      }
    });
    await new Promise<void>((resolve, reject) => {
      const tx = v1.transaction(['companies', 'applications'], 'readwrite');
      tx.objectStore('companies').put(company);
      tx.objectStore('applications').put(application);
      tx.oncomplete = () => resolve();
      const fail = () =>
        reject(new Error(tx.error?.message ?? 'transaction failed'));
      tx.onerror = fail;
      tx.onabort = fail;
    });
    v1.close();

    const repo = await openIdbRepository({ dbName });
    const snap = await repo.snapshot();
    expect(snap.companies).toEqual([company]);
    expect(snap.applications).toEqual([application]);
    for (const { name, since } of STORES) {
      if (since >= 2) expect(snap[name]).toEqual([]);
    }

    const db = await rawOpen(dbName);
    const version = db.version;
    const names = Array.from(db.objectStoreNames);
    db.close();
    expect(version).toBe(SCHEMA_VERSION);
    for (const { name } of STORES) expect(names).toContain(name);
  });

  it('upgrades a version 2 database without losing records', async () => {
    const dbName = freshName();
    const contact = {
      id: 'k1',
      createdAt: '2026-01-05T09:00:00.000Z',
      name: 'Sam Example',
    };
    const application = {
      id: 'a1',
      createdAt: '2026-01-06T09:00:00.000Z',
      companyId: 'c1',
    };
    const v2 = await rawOpen(dbName, 2, (db) => {
      for (const { name, since } of STORES) {
        if (since <= 2) db.createObjectStore(name, { keyPath: 'id' });
      }
    });
    await new Promise<void>((resolve, reject) => {
      const tx = v2.transaction(['contacts', 'applications'], 'readwrite');
      tx.objectStore('contacts').put(contact);
      tx.objectStore('applications').put(application);
      tx.oncomplete = () => resolve();
      const fail = () =>
        reject(new Error(tx.error?.message ?? 'transaction failed'));
      tx.onerror = fail;
      tx.onabort = fail;
    });
    v2.close();

    const repo = await openIdbRepository({ dbName });
    const snap = await repo.snapshot();
    expect(snap.contacts).toEqual([contact]);
    expect(snap.applications).toEqual([application]);
    for (const name of ['rounds', 'stories', 'weeklyReviews'] as const) {
      expect(snap[name]).toEqual([]);
    }

    const db = await rawOpen(dbName);
    const version = db.version;
    const names = Array.from(db.objectStoreNames);
    db.close();
    expect(version).toBe(3);
    for (const { name } of STORES) expect(names).toContain(name);
    for (const name of ['rounds', 'stories', 'weeklyReviews']) {
      expect(names).toContain(name);
    }
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

describe('onWrite', () => {
  it('is called once for an apply that writes across two stores', async () => {
    const onWrite = vi.fn(() => Promise.resolve());
    const repo = await openIdbRepository({ dbName: freshName(), onWrite });
    await repo.apply([
      { kind: 'put', store: 'companies', record: { id: 'c1', createdAt: T } },
      { kind: 'put', store: 'companies', record: { id: 'c2', createdAt: T } },
      {
        kind: 'put',
        store: 'applications',
        record: { id: 'a1', createdAt: T },
      },
    ]);
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('is not called for an empty apply', async () => {
    const onWrite = vi.fn(() => Promise.resolve());
    const repo = await openIdbRepository({ dbName: freshName(), onWrite });
    await repo.apply([]);
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('is not called when apply fails validation', async () => {
    const onWrite = vi.fn(() => Promise.resolve());
    const repo = await openIdbRepository({ dbName: freshName(), onWrite });
    const missingCreatedAt = { id: 'c1' } as unknown as Company;
    await expect(
      repo.apply([
        { kind: 'put', store: 'companies', record: missingCreatedAt },
      ]),
    ).rejects.toThrow();
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('is called once by replaceAll', async () => {
    const onWrite = vi.fn(() => Promise.resolve());
    const repo = await openIdbRepository({ dbName: freshName(), onWrite });
    await repo.replaceAll(emptySnapshot());
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('keeps the write and logs when the hook rejects', async () => {
    const onWrite = vi.fn(() =>
      Promise.reject(new Error('backup unavailable')),
    );
    const repo = await openIdbRepository({ dbName: freshName(), onWrite });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await repo.apply([
        { kind: 'put', store: 'companies', record: { id: 'c1', createdAt: T } },
      ]);
      const snap = await repo.snapshot();
      expect(snap.companies.map((c) => c.id)).toEqual(['c1']);
      expect(consoleError).toHaveBeenCalledWith(
        'Countersign: could not count a write for the backup',
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
