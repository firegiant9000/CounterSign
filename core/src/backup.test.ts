import { describe, expect, it } from 'vitest';
import {
  BACKUP_PATH,
  afterBackup,
  afterFailure,
  backupDue,
  backupStatus,
  countWrite,
  readBackupState,
  startAttempt,
  type BackupState,
} from './backup';
import { exportFileName } from './export';
import type { IsoInstant } from './types';

const H = 3_600_000;
const DAY = 24 * H;
const NOW = '2026-03-20T12:00:00.000Z' as IsoInstant;
const nowMs = Date.parse(NOW);
const ago = (ms: number): IsoInstant => new Date(nowMs - ms).toISOString();

describe('readBackupState', () => {
  it('gives an empty state for non-objects', () => {
    for (const raw of [undefined, null, 'x', [], 5]) {
      expect(readBackupState(raw)).toEqual({ writesSince: 0 });
    }
  });

  it('sanitises writesSince', () => {
    expect(readBackupState({ writesSince: '3' }).writesSince).toBe(0);
    expect(readBackupState({ writesSince: -1 }).writesSince).toBe(0);
    expect(readBackupState({ writesSince: NaN }).writesSince).toBe(0);
    expect(readBackupState({ writesSince: 2.7 }).writesSince).toBe(2);
  });

  it('drops invalid instants, bad failures and unknown keys', () => {
    const state = readBackupState({
      writesSince: 1,
      lastBackupAt: 'not a date',
      countingSince: NOW,
      lastFailure: { at: NOW, message: 5 },
      extra: true,
    });
    expect(state).toEqual({ writesSince: 1, countingSince: NOW });
  });

  it('keeps a valid failure', () => {
    const state = readBackupState({
      lastFailure: { at: NOW, message: 'disk full' },
    });
    expect(state.lastFailure).toEqual({ at: NOW, message: 'disk full' });
  });
});

describe('countWrite', () => {
  it('sets countingSince once and increments', () => {
    const first = countWrite({ writesSince: 0 }, NOW);
    expect(first).toEqual({ writesSince: 1, countingSince: NOW });
    const second = countWrite(first, ago(-H));
    expect(second.writesSince).toBe(2);
    expect(second.countingSince).toBe(NOW);
  });
});

describe('backupDue', () => {
  it('is not due when nothing was ever written', () => {
    expect(backupDue({ writesSince: 0 }, ago(-365 * DAY))).toBe(false);
  });

  it('is due at 25 writes, not 24', () => {
    const lastBackupAt = ago(DAY);
    expect(backupDue({ writesSince: 24, lastBackupAt }, NOW)).toBe(false);
    expect(backupDue({ writesSince: 25, lastBackupAt }, NOW)).toBe(true);
  });

  it('is due exactly 7 days after the last backup', () => {
    expect(
      backupDue({ writesSince: 1, lastBackupAt: ago(7 * DAY - 1) }, NOW),
    ).toBe(false);
    expect(backupDue({ writesSince: 1, lastBackupAt: ago(7 * DAY) }, NOW)).toBe(
      true,
    );
  });

  it('uses countingSince when never backed up', () => {
    expect(
      backupDue({ writesSince: 1, countingSince: ago(7 * DAY) }, NOW),
    ).toBe(true);
  });

  it('is due by time when lastBackupAt is in the future', () => {
    expect(
      backupDue({ writesSince: 0, lastBackupAt: ago(-3 * DAY) }, NOW),
    ).toBe(true);
  });

  it('gives no back-off for a lastAttemptAt in the future', () => {
    expect(
      backupDue({ writesSince: 30, lastAttemptAt: ago(-2 * DAY) }, NOW),
    ).toBe(true);
  });

  it('backs off for 24 hours after an attempt without success', () => {
    const lastBackupAt = ago(10 * DAY);
    expect(
      backupDue(
        { writesSince: 30, lastBackupAt, lastAttemptAt: ago(23 * H) },
        NOW,
      ),
    ).toBe(false);
    expect(
      backupDue(
        { writesSince: 30, lastBackupAt, lastAttemptAt: ago(24 * H) },
        NOW,
      ),
    ).toBe(true);
  });

  it('does not back off when the attempt succeeded', () => {
    const at = ago(H);
    expect(
      backupDue({ writesSince: 25, lastBackupAt: at, lastAttemptAt: at }, NOW),
    ).toBe(true);
  });

  it('is not due when now is invalid', () => {
    expect(backupDue({ writesSince: 99 }, 'garbage')).toBe(false);
  });
});

describe('transitions', () => {
  it('startAttempt sets lastAttemptAt', () => {
    expect(startAttempt({ writesSince: 3 }, NOW)).toEqual({
      writesSince: 3,
      lastAttemptAt: NOW,
    });
  });

  it('afterBackup subtracts the counted writes and clears the failure', () => {
    const state: BackupState = {
      writesSince: 27,
      lastFailure: { at: ago(DAY), message: 'x' },
      lastAttemptAt: ago(H),
    };
    const next = afterBackup(state, 25, NOW);
    expect(next.writesSince).toBe(2);
    expect(next.lastBackupAt).toBe(NOW);
    expect(next.lastFailure).toBeUndefined();
    expect(next.lastAttemptAt).toBe(state.lastAttemptAt);
    expect(afterBackup({ writesSince: 3 }, 10, NOW).writesSince).toBe(0);
  });

  it('afterFailure keeps the counter and records the failure', () => {
    const next = afterFailure({ writesSince: 7 }, NOW, 'no permission');
    expect(next.writesSince).toBe(7);
    expect(next.lastFailure).toEqual({ at: NOW, message: 'no permission' });
  });
});

describe('backupStatus', () => {
  it('warns when lastBackupAt is later than now', () => {
    expect(
      backupStatus({ writesSince: 0, lastBackupAt: ago(-3 * DAY) }, NOW),
    ).toEqual({
      text: "The last automatic backup has a date later than this computer's clock.",
      warn: true,
    });
  });

  it('says none yet without warning when nothing is counted', () => {
    expect(backupStatus({ writesSince: 0 }, NOW)).toEqual({
      text: 'No automatic backup yet.',
      warn: false,
    });
  });

  it('warns when counting began over 14 days ago with no backup', () => {
    const s = backupStatus(
      { writesSince: 1, countingSince: ago(15 * DAY) },
      NOW,
    );
    expect(s.text).toBe('No automatic backup yet.');
    expect(s.warn).toBe(true);
  });

  it('describes the age of the last backup', () => {
    expect(
      backupStatus({ writesSince: 0, lastBackupAt: ago(2 * H) }, NOW).text,
    ).toBe('Last automatic backup: today.');
    expect(
      backupStatus({ writesSince: 0, lastBackupAt: ago(30 * H) }, NOW).text,
    ).toBe('Last automatic backup: yesterday.');
    const fourteen = backupStatus(
      { writesSince: 0, lastBackupAt: ago(14 * DAY) },
      NOW,
    );
    expect(fourteen.text).toBe('Last automatic backup: 14 days ago.');
    expect(fourteen.warn).toBe(false);
    expect(
      backupStatus({ writesSince: 0, lastBackupAt: ago(15 * DAY) }, NOW).warn,
    ).toBe(true);
  });

  it('shows a failure only when it is after the last backup', () => {
    const after = backupStatus(
      {
        writesSince: 0,
        lastBackupAt: ago(2 * DAY),
        lastFailure: { at: ago(H), message: 'boom' },
      },
      NOW,
    );
    expect(after.failure).toBe('boom');
    expect(after.warn).toBe(true);
    const before = backupStatus(
      {
        writesSince: 0,
        lastBackupAt: ago(H),
        lastFailure: { at: ago(2 * DAY), message: 'boom' },
      },
      NOW,
    );
    expect(before.failure).toBeUndefined();
    expect(before.warn).toBe(false);
  });
});

describe('restore cannot overwrite the backup', () => {
  it('keeps pre-restore files away from BACKUP_PATH', () => {
    for (const at of [
      '2026-01-01T00:00:00.000Z',
      '2026-06-15T12:34:56.000Z',
      '2026-12-31T23:59:59.000Z',
    ] as IsoInstant[]) {
      expect(`Countersign/${exportFileName('pre-restore', at)}`).not.toBe(
        BACKUP_PATH,
      );
    }
    expect(BACKUP_PATH.startsWith('Countersign/countersign-export')).toBe(
      false,
    );
  });
});
