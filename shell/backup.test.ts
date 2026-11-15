import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_PATH } from '../core/src/backup';
import { parseExport } from '../core/src/export';
import { createMemoryRepository } from '../core/src/memory-repository';
import {
  BACKUP_TIMEOUT_MS,
  ensureBackupAlarm,
  runBackupCheck,
  type BackupDeps,
} from './backup';
import type { FileSaver } from './files/download';
import {
  loadBackupState,
  recordWrite,
  saveBackupState,
} from './storage/backup-state';
import type { KeyValueArea } from './storage/settings';

const NOW = '2026-03-10T12:00:00.000Z';

function mapArea(): KeyValueArea {
  const map = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(map.get(key)),
    set: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

type SaveFn = FileSaver['save'];

async function setup(options: {
  writesSince: number;
  save?: SaveFn;
  busy?: boolean;
}) {
  const repo = createMemoryRepository();
  await repo.apply([
    {
      kind: 'put',
      store: 'companies',
      record: { id: 'c1', createdAt: '2026-03-01T00:00:00.000Z' },
    },
  ]);
  const area = mapArea();
  await saveBackupState(area, {
    writesSince: options.writesSince,
    lastBackupAt: '2026-03-09T00:00:00.000Z',
  });
  const calls: Parameters<SaveFn>[] = [];
  const save: SaveFn =
    options.save ??
    ((...args) => {
      calls.push(args);
      return Promise.resolve();
    });
  const saver: FileSaver = {
    save: (...args) => {
      if (options.save) calls.push(args);
      return save(...args);
    },
  };
  const deps: BackupDeps = {
    repo,
    area,
    saver,
    clock: { now: () => NOW },
    withWriteLock: (fn) => fn(),
    tryBackupLock: async (fn) => {
      if (options.busy) return false;
      await fn();
      return true;
    },
  };
  return { deps, area, repo, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runBackupCheck', () => {
  it('does nothing when not due', async () => {
    const { deps, calls } = await setup({ writesSince: 3 });
    expect(await runBackupCheck(deps)).toBe('not_due');
    expect(calls).toHaveLength(0);
  });

  it('saves when due', async () => {
    const { deps, area, repo, calls } = await setup({ writesSince: 25 });
    expect(await runBackupCheck(deps)).toBe('saved');
    expect(calls).toHaveLength(1);
    const [path, text, options] = calls[0] as Parameters<SaveFn>;
    expect(path).toBe(BACKUP_PATH);
    expect(options).toEqual({ saveAs: false, conflictAction: 'overwrite' });
    const parsed = parseExport(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.file.data).toEqual(await repo.snapshot());
    const state = await loadBackupState(area);
    expect(state.writesSince).toBe(0);
    expect(state.lastBackupAt).toBe(NOW);
    expect(state.lastAttemptAt).toBe(NOW);
    expect(state.lastFailure).toBeUndefined();
  });

  it('writes state under the write lock and downloads outside it', async () => {
    const { deps, area } = await setup({ writesSince: 25 });
    let held = false;
    let savedWhileHeld: boolean | undefined;
    const setsHeld: boolean[] = [];
    deps.withWriteLock = async (fn) => {
      held = true;
      try {
        return await fn();
      } finally {
        held = false;
      }
    };
    deps.area = {
      get: (key) => area.get(key),
      set: (key, value) => {
        setsHeld.push(held);
        return area.set(key, value);
      },
    };
    deps.saver = {
      save: () => {
        savedWhileHeld = held;
        return Promise.resolve();
      },
    };
    expect(await runBackupCheck(deps)).toBe('saved');
    expect(savedWhileHeld).toBe(false);
    expect(setsHeld).toEqual([true, true]);
  });

  it('keeps counting writes made during the download', async () => {
    const setupResult = await setup({ writesSince: 25 });
    const { deps, area } = setupResult;
    deps.saver = {
      save: async () => {
        await recordWrite(area, NOW);
        await recordWrite(area, NOW);
      },
    };
    expect(await runBackupCheck(deps)).toBe('saved');
    expect((await loadBackupState(area)).writesSince).toBe(2);
  });

  it('backs off after a failure', async () => {
    const { deps, area, calls } = await setup({
      writesSince: 25,
      save: () => Promise.reject(new Error('Download failed.')),
    });
    expect(await runBackupCheck(deps)).toBe('failed');
    const state = await loadBackupState(area);
    expect(state.lastFailure?.message).toBe('Download failed.');
    expect(state.writesSince).toBe(25);
    expect(await runBackupCheck(deps)).toBe('not_due');
    expect(calls).toHaveLength(1);
  });

  it('fails a stalled download after the timeout', async () => {
    vi.useFakeTimers();
    const { deps, area } = await setup({
      writesSince: 25,
      save: () => new Promise<void>(() => undefined),
    });
    const pending = runBackupCheck(deps);
    await vi.advanceTimersByTimeAsync(BACKUP_TIMEOUT_MS);
    expect(await pending).toBe('failed');
    const state = await loadBackupState(area);
    expect(state.lastFailure?.message).toContain('60 seconds');
    expect(state.writesSince).toBe(25);
  });

  it('is busy when the backup lock is held', async () => {
    const { deps, area, calls } = await setup({ writesSince: 25, busy: true });
    const before = await loadBackupState(area);
    expect(await runBackupCheck(deps)).toBe('busy');
    expect(calls).toHaveLength(0);
    expect(await loadBackupState(area)).toEqual(before);
  });
});

describe('ensureBackupAlarm', () => {
  it('creates the alarm when missing', async () => {
    const create = vi.fn();
    await ensureBackupAlarm({
      get: () => Promise.resolve(undefined),
      create,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('countersign-backup-check', {
      periodInMinutes: 1440,
      delayInMinutes: 1,
    });
  });

  it('leaves an existing alarm alone', async () => {
    const create = vi.fn();
    await ensureBackupAlarm({
      get: () => Promise.resolve({ name: 'countersign-backup-check' }),
      create,
    });
    expect(create).not.toHaveBeenCalled();
  });
});
