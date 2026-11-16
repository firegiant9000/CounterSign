import { describe, expect, it } from 'vitest';
import { readBackupState } from '../../core/src/backup';
import {
  BACKUP_STATE_KEY,
  loadBackupState,
  recordWrite,
  saveBackupState,
} from './backup-state';
import type { KeyValueArea } from './settings';

function memoryArea(): KeyValueArea & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: (key) => Promise.resolve(map.get(key)),
    set: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

describe('backup state in storage', () => {
  it('loads an empty area as zero writes', async () => {
    expect(await loadBackupState(memoryArea())).toEqual({ writesSince: 0 });
  });

  it('counts three writes and keeps the first countingSince', async () => {
    const area = memoryArea();
    await recordWrite(area, '2026-01-01T00:00:00.000Z');
    await recordWrite(area, '2026-01-02T00:00:00.000Z');
    await recordWrite(area, '2026-01-03T00:00:00.000Z');
    expect(await loadBackupState(area)).toEqual({
      writesSince: 3,
      countingSince: '2026-01-01T00:00:00.000Z',
    });
  });

  it('treats a garbage value as zero and counts from there', async () => {
    const area = memoryArea();
    area.map.set(BACKUP_STATE_KEY, 'garbage');
    expect(await loadBackupState(area)).toEqual({ writesSince: 0 });
    await recordWrite(area, '2026-01-01T00:00:00.000Z');
    expect((await loadBackupState(area)).writesSince).toBe(1);
  });

  it('keeps lastBackupAt and lastFailure already stored', async () => {
    const area = memoryArea();
    await saveBackupState(area, {
      writesSince: 4,
      lastBackupAt: '2025-12-01T00:00:00.000Z',
      lastFailure: { at: '2025-12-02T00:00:00.000Z', message: 'disk full' },
    });
    await recordWrite(area, '2026-01-01T00:00:00.000Z');
    const state = await loadBackupState(area);
    expect(state.writesSince).toBe(5);
    expect(state.lastBackupAt).toBe('2025-12-01T00:00:00.000Z');
    expect(state.lastFailure).toEqual({
      at: '2025-12-02T00:00:00.000Z',
      message: 'disk full',
    });
  });

  it('stores a value that round-trips through readBackupState', async () => {
    const area = memoryArea();
    await recordWrite(area, '2026-01-01T00:00:00.000Z');
    const stored = area.map.get(BACKUP_STATE_KEY);
    expect(readBackupState(stored)).toEqual(stored);
  });
});
