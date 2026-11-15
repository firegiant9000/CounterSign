import type { IsoInstant } from './types';

export const BACKUP_PATH = 'Countersign/countersign-backup.json';
export const BACKUP_EVERY_WRITES = 25;
export const BACKUP_EVERY_DAYS = 7;
export const BACKUP_WARN_DAYS = 14;
export const BACKUP_RETRY_HOURS = 24;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface BackupState {
  writesSince: number;
  countingSince?: IsoInstant;
  lastBackupAt?: IsoInstant;
  lastAttemptAt?: IsoInstant;
  lastFailure?: { at: IsoInstant; message: string };
}

export interface BackupStatus {
  text: string;
  warn: boolean;
  failure?: string;
}

/** Epoch ms for a valid instant, otherwise undefined. */
function ms(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : undefined;
}

function validInstant(value: unknown): IsoInstant | undefined {
  return ms(value) === undefined ? undefined : (value as IsoInstant);
}

export function readBackupState(raw: unknown): BackupState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { writesSince: 0 };
  }
  const r = raw as Record<string, unknown>;
  const n = r['writesSince'];
  const state: BackupState = {
    writesSince:
      typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
  };
  const countingSince = validInstant(r['countingSince']);
  if (countingSince !== undefined) state.countingSince = countingSince;
  const lastBackupAt = validInstant(r['lastBackupAt']);
  if (lastBackupAt !== undefined) state.lastBackupAt = lastBackupAt;
  const lastAttemptAt = validInstant(r['lastAttemptAt']);
  if (lastAttemptAt !== undefined) state.lastAttemptAt = lastAttemptAt;
  const f = r['lastFailure'];
  if (typeof f === 'object' && f !== null && !Array.isArray(f)) {
    const at = validInstant((f as Record<string, unknown>)['at']);
    const message = (f as Record<string, unknown>)['message'];
    if (at !== undefined && typeof message === 'string') {
      state.lastFailure = { at, message };
    }
  }
  return state;
}

export function countWrite(state: BackupState, now: IsoInstant): BackupState {
  return {
    ...state,
    writesSince: state.writesSince + 1,
    countingSince: state.countingSince ?? now,
  };
}

export function backupDue(state: BackupState, now: IsoInstant): boolean {
  const nowMs = ms(now);
  if (nowMs === undefined) return false;
  const attempt = ms(state.lastAttemptAt);
  if (attempt !== undefined && nowMs - attempt < BACKUP_RETRY_HOURS * HOUR_MS) {
    const backup = ms(state.lastBackupAt);
    if (backup === undefined || backup < attempt) return false;
  }
  if (state.writesSince >= BACKUP_EVERY_WRITES) return true;
  const since = ms(state.lastBackupAt) ?? ms(state.countingSince);
  return since !== undefined && nowMs - since >= BACKUP_EVERY_DAYS * DAY_MS;
}

export function startAttempt(state: BackupState, at: IsoInstant): BackupState {
  return { ...state, lastAttemptAt: at };
}

export function afterBackup(
  state: BackupState,
  counted: number,
  at: IsoInstant,
): BackupState {
  const next: BackupState = {
    ...state,
    writesSince: Math.max(0, state.writesSince - counted),
    lastBackupAt: at,
  };
  delete next.lastFailure;
  return next;
}

export function afterFailure(
  state: BackupState,
  at: IsoInstant,
  message: string,
): BackupState {
  return { ...state, lastFailure: { at, message } };
}

export function backupStatus(
  state: BackupState,
  now: IsoInstant,
): BackupStatus {
  const nowMs = ms(now);
  const lastMs = ms(state.lastBackupAt);
  const failureAt = ms(state.lastFailure?.at);
  const showFailure =
    state.lastFailure !== undefined &&
    failureAt !== undefined &&
    (lastMs === undefined || failureAt > lastMs);
  const failure = showFailure ? state.lastFailure?.message : undefined;
  const days = (from: number): number =>
    nowMs === undefined ? 0 : Math.max(0, Math.floor((nowMs - from) / DAY_MS));

  let text: string;
  let stale = false;
  if (lastMs === undefined) {
    text = 'No automatic backup yet.';
    const counting = ms(state.countingSince);
    stale = counting !== undefined && days(counting) > BACKUP_WARN_DAYS;
  } else {
    const d = days(lastMs);
    stale = d > BACKUP_WARN_DAYS;
    text =
      d === 0
        ? 'Last automatic backup: today.'
        : d === 1
          ? 'Last automatic backup: yesterday.'
          : `Last automatic backup: ${d} days ago.`;
  }
  const status: BackupStatus = { text, warn: stale || failure !== undefined };
  if (failure !== undefined) status.failure = failure;
  return status;
}
