import { describe, expect, it } from 'vitest';
import { updateApplicationOps } from '../../core/src/application-ops';
import { createMemoryRepository } from '../../core/src/memory-repository';
import type { Repository } from '../../core/src/repository';
import type { Snapshot } from '../../core/src/types';
import { createWriteQueue } from './write-queue';

const CREATED = '2026-01-05T09:00:00.000Z';

async function seeded(): Promise<Repository> {
  const repo = createMemoryRepository();
  await repo.apply([
    {
      kind: 'put',
      store: 'applications',
      record: { id: 'app-1', createdAt: CREATED },
    },
  ]);
  return repo;
}

function appFrom(d: Snapshot) {
  const app = d.applications.find((a) => a.id === 'app-1');
  if (!app) throw new Error('missing app-1');
  return app;
}

describe('write queue', () => {
  it('persists two quick field saves', async () => {
    const repo = await seeded();
    const queue = createWriteQueue(repo);
    const a = queue.run((d) =>
      updateApplicationOps(appFrom(d), { title: 'Platform engineer' }),
    );
    const b = queue.run((d) =>
      updateApplicationOps(appFrom(d), { notes: 'Phone screen booked' }),
    );
    await Promise.all([a, b]);
    const stored = appFrom(await repo.snapshot());
    expect(stored.title).toBe('Platform engineer');
    expect(stored.notes).toBe('Phone screen booked');
  });

  it('does not let a failing write block the next', async () => {
    const repo = await seeded();
    const queue = createWriteQueue(repo);
    const failing = queue.run(() => {
      throw new Error('builder failed');
    });
    const next = queue.run((d) =>
      updateApplicationOps(appFrom(d), { title: 'Still saved' }),
    );
    await expect(failing).rejects.toThrow('builder failed');
    await next;
    expect(appFrom(await repo.snapshot()).title).toBe('Still saved');
  });

  it('runs a queued write only after a pending exclusive settles', async () => {
    const repo = await seeded();
    const queue = createWriteQueue(repo);
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ex = queue.exclusive(async () => {
      await gate;
      order.push('exclusive');
    });
    const w = queue.run((d) => {
      order.push('run');
      return updateApplicationOps(appFrom(d), { title: 'After exclusive' });
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await Promise.all([ex, w]);
    expect(order).toEqual(['exclusive', 'run']);
    expect(appFrom(await repo.snapshot()).title).toBe('After exclusive');
  });

  it('does not let a rejecting exclusive block the next turn', async () => {
    const repo = await seeded();
    const queue = createWriteQueue(repo);
    const failing = queue.exclusive(() => Promise.reject(new Error('boom')));
    const next = queue.run((d) =>
      updateApplicationOps(appFrom(d), { title: 'Ran after' }),
    );
    await expect(failing).rejects.toThrow('boom');
    await next;
    expect(appFrom(await repo.snapshot()).title).toBe('Ran after');
  });

  it('resolves with the current snapshot and skips apply for no ops', async () => {
    const inner = await seeded();
    let applies = 0;
    const repo: Repository = {
      snapshot: () => inner.snapshot(),
      apply: (ops) => {
        applies += 1;
        return inner.apply(ops);
      },
      replaceAll: (data) => inner.replaceAll(data),
    };
    const queue = createWriteQueue(repo);
    const snap = await queue.run(() => []);
    expect(applies).toBe(0);
    expect(snap.applications).toHaveLength(1);
  });
});
