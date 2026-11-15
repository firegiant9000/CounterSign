import { describe, expect, it } from 'vitest';
import { parseExport } from '../core/src/export';
import type { ExportFile } from '../core/src/export';
import { createMemoryRepository } from '../core/src/memory-repository';
import type { Repository } from '../core/src/repository';
import { emptySnapshot } from '../core/src/schema';
import type { Settings, Snapshot } from '../core/src/types';
import { createDataService } from './data-service';
import type { FileSaver } from './files/download';
import { loadSettings, saveSettings } from './storage/settings';
import type { KeyValueArea } from './storage/settings';

const NOW = '2026-11-14T15:30:00.000Z';
const clock = { now: (): string => NOW };

function mapArea(log: string[] = []): KeyValueArea {
  const map = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(map.get(key)),
    set: (key, value) => {
      log.push('saveSettings');
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

interface SaveCall {
  path: string;
  text: string;
  saveAs: boolean;
}

function fakeSaver(
  log: string[] = [],
  fail = false,
): { saver: FileSaver; calls: SaveCall[] } {
  const calls: SaveCall[] = [];
  return {
    calls,
    saver: {
      save: (path, text, options) => {
        log.push('save');
        calls.push({ path, text, saveAs: options.saveAs });
        return fail
          ? Promise.reject(new Error('download cancelled'))
          : Promise.resolve();
      },
    },
  };
}

function snapshotWith(name: string): Snapshot {
  return {
    ...emptySnapshot(),
    companies: [{ id: `c-${name}`, createdAt: NOW, name }],
  };
}

function incoming(data: Snapshot, settings: Settings): ExportFile {
  return {
    app: 'countersign',
    schemaVersion: 1,
    exportedAt: NOW,
    data,
    settings,
  };
}

async function seeded(name: string): Promise<Repository> {
  const repo = createMemoryRepository();
  await repo.replaceAll(snapshotWith(name));
  return repo;
}

describe('data service', () => {
  it('exports everything to one file the user places', async () => {
    const repo = await seeded('Old Co');
    const area = mapArea();
    await saveSettings(area, { statusLabels: { applied: 'Sent' } });
    const { saver, calls } = fakeSaver();
    await createDataService({ repo, area, saver, clock }).exportNow();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('countersign-export-20261114-153000Z.json');
    expect(calls[0]?.saveAs).toBe(true);
    const parsed = parseExport(calls[0]?.text ?? '');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.data).toEqual(await repo.snapshot());
      expect(parsed.file.settings).toEqual({
        statusLabels: { applied: 'Sent' },
      });
      expect(parsed.file.exportedAt).toBe(NOW);
    }
  });

  it('saves a safety copy before it replaces anything', async () => {
    const log: string[] = [];
    const real = await seeded('Old Co');
    const repo: Repository = {
      snapshot: () => real.snapshot(),
      apply: (ops) => real.apply(ops),
      replaceAll: (data) => {
        log.push('replaceAll');
        return real.replaceAll(data);
      },
    };
    const area = mapArea(log);
    const { saver, calls } = fakeSaver(log);
    await createDataService({ repo, area, saver, clock }).restore(
      incoming(snapshotWith('New Co'), { statusLabels: { offer: 'Won' } }),
    );
    expect(log).toEqual(['save', 'replaceAll', 'saveSettings']);
    expect(calls[0]?.path).toBe(
      'Countersign/countersign-export-pre-restore-20261114-153000Z.json',
    );
    expect(calls[0]?.saveAs).toBe(false);
    expect(calls[0]?.text).toContain('Old Co');
    expect(calls[0]?.text).not.toContain('New Co');
    expect((await repo.snapshot()).companies[0]?.name).toBe('New Co');
  });

  it('skips the safety copy when there is nothing to lose', async () => {
    const repo = createMemoryRepository();
    const { saver, calls } = fakeSaver();
    await createDataService({ repo, area: mapArea(), saver, clock }).restore(
      incoming(snapshotWith('New Co'), {}),
    );
    expect(calls).toHaveLength(0);
    expect((await repo.snapshot()).companies[0]?.name).toBe('New Co');
  });

  it('stops when the safety copy fails', async () => {
    const repo = await seeded('Old Co');
    const before = await repo.snapshot();
    const area = mapArea();
    await saveSettings(area, { statusLabels: { applied: 'Sent' } });
    const { saver } = fakeSaver([], true);
    await expect(
      createDataService({ repo, area, saver, clock }).restore(
        incoming(snapshotWith('New Co'), { statusLabels: { offer: 'Won' } }),
      ),
    ).rejects.toThrow('download cancelled');
    expect(await repo.snapshot()).toEqual(before);
    expect(await loadSettings(area)).toEqual({
      statusLabels: { applied: 'Sent' },
    });
  });

  it('leaves settings alone when the data swap fails', async () => {
    const log: string[] = [];
    const real = await seeded('Old Co');
    const repo: Repository = {
      snapshot: () => real.snapshot(),
      apply: (ops) => real.apply(ops),
      replaceAll: () => Promise.reject(new Error('swap failed')),
    };
    const { saver } = fakeSaver();
    await expect(
      createDataService({ repo, area: mapArea(log), saver, clock }).restore(
        incoming(snapshotWith('New Co'), {}),
      ),
    ).rejects.toThrow('swap failed');
    expect(log).toEqual([]);
  });

  it('loads empty settings when none are stored', async () => {
    expect(await loadSettings(mapArea())).toEqual({});
  });
});
