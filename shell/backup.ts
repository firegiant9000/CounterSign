import {
  BACKUP_PATH,
  afterBackup,
  afterFailure,
  backupDue,
  startAttempt,
} from '../core/src/backup';
import { buildExport } from '../core/src/export';
import type { Repository } from '../core/src/repository';
import type { Deps } from '../core/src/types';
import { browserFileSaver } from './files/download';
import type { FileSaver } from './files/download';
import { loadBackupState, saveBackupState } from './storage/backup-state';
import { openIdbRepository } from './storage/idb-repository';
import { browserLocalArea, loadSettings } from './storage/settings';
import type { KeyValueArea } from './storage/settings';
import { browserDeps } from './deps';
import { withWriteLock } from './ui/write-queue';

export const BACKUP_ALARM = 'countersign-backup-check';
export const BACKUP_TIMEOUT_MS = 60_000;
const BACKUP_LOCK = 'countersign-backup';

export interface BackupDeps {
  repo: Pick<Repository, 'snapshot'>;
  area: KeyValueArea;
  saver: FileSaver;
  clock: Pick<Deps, 'now'>;
  withWriteLock<T>(fn: () => Promise<T>): Promise<T>;
  /** Runs fn under the lock 'countersign-backup' if it is free; resolves false without running fn if it is held. */
  tryBackupLock(fn: () => Promise<void>): Promise<boolean>;
}

export type BackupOutcome = 'not_due' | 'busy' | 'saved' | 'failed';

export async function runBackupCheck(deps: BackupDeps): Promise<BackupOutcome> {
  const { repo, area, saver, clock } = deps;
  let outcome: BackupOutcome = 'not_due';

  const ran = await deps.tryBackupLock(async () => {
    const now = clock.now();

    // 1. Under the write lock: decide, snapshot, record the attempt.
    const started = await deps.withWriteLock(async () => {
      const state = await loadBackupState(area);
      if (!backupDue(state, now)) return undefined;
      const data = await repo.snapshot();
      const settings = await loadSettings(area);
      await saveBackupState(area, startAttempt(state, now));
      return { data, settings, counted: state.writesSince };
    });
    if (started === undefined) return;

    // 2. Without the lock: save the file, so writes can continue meanwhile.
    let failure: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error('The backup did not finish saving within 60 seconds.'),
        );
      }, BACKUP_TIMEOUT_MS);
    });
    try {
      const text = JSON.stringify(
        buildExport(started.data, started.settings, { now: () => now }),
        null,
        2,
      );
      await Promise.race([
        saver.save(BACKUP_PATH, text, {
          saveAs: false,
          conflictAction: 'overwrite',
        }),
        timeout,
      ]);
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }

    // 3. Under the write lock: record the result against the current state.
    await deps.withWriteLock(async () => {
      const current = await loadBackupState(area);
      await saveBackupState(
        area,
        failure === undefined
          ? afterBackup(current, started.counted, now)
          : afterFailure(current, now, failure),
      );
    });
    outcome = failure === undefined ? 'saved' : 'failed';
  });

  return ran ? outcome : 'busy';
}

export interface AlarmApi {
  get(name: string): Promise<unknown>;
  create(
    name: string,
    info: { periodInMinutes: number; delayInMinutes: number },
  ): void | Promise<void>;
}

export async function ensureBackupAlarm(alarms: AlarmApi): Promise<void> {
  const existing = await alarms.get(BACKUP_ALARM);
  if (existing === undefined || existing === null) {
    await alarms.create(BACKUP_ALARM, {
      periodInMinutes: 1440,
      delayInMinutes: 1,
    });
  }
}

export function browserBackupDeps(): BackupDeps {
  let repoPromise: Promise<Repository> | undefined;
  return {
    repo: {
      snapshot: () => {
        const opening = (repoPromise ??= openIdbRepository());
        // A failed open must not be cached for the life of the event page.
        opening.catch(() => {
          if (repoPromise === opening) repoPromise = undefined;
        });
        return opening.then((repo) => repo.snapshot());
      },
    },
    area: browserLocalArea(),
    saver: browserFileSaver(),
    clock: browserDeps(),
    withWriteLock,
    tryBackupLock: (fn) =>
      navigator.locks.request(
        BACKUP_LOCK,
        { ifAvailable: true },
        async (lock) => {
          if (lock === null) return false;
          await fn();
          return true;
        },
      ),
  };
}
