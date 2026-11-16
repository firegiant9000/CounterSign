import { browser } from 'wxt/browser';
import { countWrite, readBackupState } from '../../core/src/backup';
import type { BackupState } from '../../core/src/backup';
import type { IsoInstant } from '../../core/src/types';
import type { KeyValueArea } from './settings';

export const BACKUP_STATE_KEY = 'backupState';

export async function loadBackupState(
  area: KeyValueArea,
): Promise<BackupState> {
  return readBackupState(await area.get(BACKUP_STATE_KEY));
}

export function saveBackupState(
  area: KeyValueArea,
  state: BackupState,
): Promise<void> {
  return area.set(BACKUP_STATE_KEY, state);
}

// No locking here: the only caller is the repository hook, which runs inside the write lock.
export async function recordWrite(
  area: KeyValueArea,
  now: IsoInstant,
): Promise<void> {
  await saveBackupState(area, countWrite(await loadBackupState(area), now));
}

export function onBackupStateChanged(
  listener: (state: BackupState) => void,
): () => void {
  const handler = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ): void => {
    const change = changes[BACKUP_STATE_KEY];
    if (areaName === 'local' && change !== undefined) {
      listener(readBackupState(change.newValue));
    }
  };
  browser.storage.onChanged.addListener(handler);
  return () => {
    browser.storage.onChanged.removeListener(handler);
  };
}
