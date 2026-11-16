import { addStatusEventOps } from './application-ops';
import { applicationRows } from './application-list';
import type { ApplicationRow } from './application-list';
import { compareLocalDate, daysBetween } from './dates';
import type { WriteOp } from './repository';
import { noResponseDays } from './settings';
import { currentStatus } from './status';
import type { Deps, Id, LocalDate, Snapshot } from './types';

export interface QuietRow extends ApplicationRow {
  statusDate: LocalDate;
  quietDays: number;
}

/** Applied applications whose last live event is more than `cutoffDays` old. Oldest first. */
export function quietApplications(
  data: Snapshot,
  cutoffDays: number,
  today: LocalDate,
): QuietRow[] {
  const cutoff = noResponseDays({ noResponseDays: cutoffDays });
  const quiet: QuietRow[] = [];
  for (const row of applicationRows(data)) {
    if (row.status !== 'applied' || row.statusDate === undefined) continue;
    const quietDays = daysBetween(row.statusDate, today);
    if (quietDays === undefined || quietDays <= cutoff) continue;
    quiet.push({ ...row, statusDate: row.statusDate, quietDays });
  }
  return quiet.sort(
    (a, b) =>
      compareLocalDate(a.statusDate, b.statusDate) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** One No response event per distinct application that still exists and is Applied. */
export function closeAsNoResponseOps(
  data: Snapshot,
  applicationIds: readonly Id[],
  today: LocalDate,
  deps: Deps,
): WriteOp[] {
  const existing = new Set(data.applications.map((a) => a.id));
  const ops: WriteOp[] = [];
  for (const id of new Set(applicationIds)) {
    if (!existing.has(id)) continue;
    if (currentStatus(data.statusEvents, id)?.status !== 'applied') continue;
    ops.push(
      ...addStatusEventOps(
        id,
        { status: 'no_response', occurredOn: today },
        deps,
      ),
    );
  }
  return ops;
}
