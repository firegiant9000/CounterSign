import { describe, expect, it } from 'vitest';
import type { Repository } from '../src/repository';
import { emptySnapshot } from '../src/schema';
import type { Application, Company, Snapshot } from '../src/types';

const T = '2026-01-05T09:00:00.000Z';

export function describeRepositoryContract(
  name: string,
  make: () => Promise<Repository>,
): void {
  describe(`${name} repository contract`, () => {
    it('starts empty', async () => {
      const repo = await make();
      expect(await repo.snapshot()).toEqual(emptySnapshot());
    });

    it('returns what apply put', async () => {
      const repo = await make();
      const company: Company = { id: 'c1', createdAt: T, name: 'Acme Example' };
      const app: Application = {
        id: 'a1',
        createdAt: T,
        companyId: 'c1',
        title: 'Engineer',
      };
      await repo.apply([
        { kind: 'put', store: 'companies', record: company },
        { kind: 'put', store: 'applications', record: app },
      ]);
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([company]);
      expect(snap.applications).toEqual([app]);
    });

    it('replaces a record that has the same id', async () => {
      const repo = await make();
      await repo.apply([
        {
          kind: 'put',
          store: 'companies',
          record: { id: 'c1', createdAt: T, name: 'Old' },
        },
      ]);
      await repo.apply([
        {
          kind: 'put',
          store: 'companies',
          record: { id: 'c1', createdAt: T, name: 'New' },
        },
      ]);
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([{ id: 'c1', createdAt: T, name: 'New' }]);
    });

    it('deletes only the named record', async () => {
      const repo = await make();
      await repo.apply([
        { kind: 'put', store: 'companies', record: { id: 'c1', createdAt: T } },
        { kind: 'put', store: 'companies', record: { id: 'c2', createdAt: T } },
      ]);
      await repo.apply([{ kind: 'delete', store: 'companies', id: 'c1' }]);
      const snap = await repo.snapshot();
      expect(snap.companies.map((c) => c.id)).toEqual(['c2']);
    });

    it('applies a batch all or nothing', async () => {
      const repo = await make();
      const bad = {
        kind: 'put',
        store: 'applications',
        record: { createdAt: T },
      } as unknown as Parameters<Repository['apply']>[0][number];
      await expect(
        repo.apply([
          {
            kind: 'put',
            store: 'companies',
            record: { id: 'c1', createdAt: T },
          },
          bad,
        ]),
      ).rejects.toThrow();
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([]);
    });

    it('replaceAll swaps every store', async () => {
      const repo = await make();
      await repo.apply([
        {
          kind: 'put',
          store: 'applications',
          record: { id: 'old', createdAt: T },
        },
      ]);
      const next: Snapshot = {
        ...emptySnapshot(),
        companies: [{ id: 'c9', createdAt: T, name: 'Fresh' }],
      };
      await repo.replaceAll(next);
      const snap = await repo.snapshot();
      expect(snap.applications).toEqual([]);
      expect(snap.companies).toEqual([
        { id: 'c9', createdAt: T, name: 'Fresh' },
      ]);
    });

    it('replaceAll is all or nothing', async () => {
      const repo = await make();
      await repo.apply([
        {
          kind: 'put',
          store: 'companies',
          record: { id: 'keep', createdAt: T },
        },
      ]);
      const bad = {
        ...emptySnapshot(),
        companies: [{ id: 'c9', createdAt: T }],
        applications: [{ createdAt: T }],
      } as unknown as Snapshot;
      await expect(repo.replaceAll(bad)).rejects.toThrow();
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([{ id: 'keep', createdAt: T }]);
      expect(snap.applications).toEqual([]);
    });

    it('replaceAll rejects duplicate ids in a store', async () => {
      const repo = await make();
      await repo.apply([
        {
          kind: 'put',
          store: 'companies',
          record: { id: 'keep', createdAt: T },
        },
      ]);
      const dup: Snapshot = {
        ...emptySnapshot(),
        companies: [
          { id: 'c9', createdAt: T },
          { id: 'c9', createdAt: T, name: 'Twin' },
        ],
      };
      await expect(repo.replaceAll(dup)).rejects.toThrow();
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([{ id: 'keep', createdAt: T }]);
    });

    it('apply rejects a delete with an empty id and changes nothing', async () => {
      const repo = await make();
      await repo.apply([
        {
          kind: 'put',
          store: 'companies',
          record: { id: 'keep', createdAt: T },
        },
      ]);
      await expect(
        repo.apply([
          {
            kind: 'put',
            store: 'companies',
            record: { id: 'c2', createdAt: T },
          },
          { kind: 'delete', store: 'companies', id: '' },
        ]),
      ).rejects.toThrow();
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([{ id: 'keep', createdAt: T }]);
    });

    it('replaceAll rejects a snapshot missing a store and changes nothing', async () => {
      const repo = await make();
      await repo.apply([
        {
          kind: 'put',
          store: 'companies',
          record: { id: 'keep', createdAt: T },
        },
      ]);
      const partial = {
        ...emptySnapshot(),
        companies: [],
      } as Partial<Snapshot>;
      delete partial.documents;
      await expect(repo.replaceAll(partial as Snapshot)).rejects.toThrow();
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([{ id: 'keep', createdAt: T }]);
    });

    it('returns copies', async () => {
      const repo = await make();
      const company: Company = { id: 'c1', createdAt: T, name: 'Acme Example' };
      await repo.apply([{ kind: 'put', store: 'companies', record: company }]);
      company.name = 'Changed by caller';
      const first = await repo.snapshot();
      expect(first.companies[0]?.name).toBe('Acme Example');
      const stored = first.companies[0];
      if (stored) stored.name = 'Changed in snapshot';
      first.companies.push({ id: 'x', createdAt: T });
      const second = await repo.snapshot();
      expect(second.companies).toEqual([
        { id: 'c1', createdAt: T, name: 'Acme Example' },
      ]);
    });

    it('keeps fields it does not know', async () => {
      const repo = await make();
      const record = {
        id: 'c1',
        createdAt: T,
        name: 'Acme Example',
        futureField: { nested: [1, 2, 3] },
      };
      await repo.apply([{ kind: 'put', store: 'companies', record }]);
      const snap = await repo.snapshot();
      expect(snap.companies).toEqual([record]);
    });
  });
}
