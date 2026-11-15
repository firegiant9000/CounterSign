import { compareLocalDate } from './dates';
import {
  currentStatus,
  effectiveDate,
  isArchived,
  statusLabel,
} from './status';
import type {
  Actor,
  Id,
  IsoInstant,
  LocalDate,
  Snapshot,
  StatusEvent,
} from './types';

export interface ApplicationRow {
  id: Id;
  companyName: string;
  title: string;
  url?: string;
  notes: string;
  status?: string;
  statusLabel: string;
  statusDate?: LocalDate;
  nextActionDate?: LocalDate;
  nextActor?: Actor;
  archived: boolean;
  createdAt: IsoInstant;
}

export interface RowFilter {
  query?: string;
  status?: string;
  scope?: 'active' | 'archived' | 'all';
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Dated next actions first (ascending), then undated; ties newest first, then by id. */
function compareRows(a: ApplicationRow, b: ApplicationRow): number {
  if (a.nextActionDate !== b.nextActionDate) {
    if (a.nextActionDate === undefined) return 1;
    if (b.nextActionDate === undefined) return -1;
    return compareLocalDate(a.nextActionDate, b.nextActionDate);
  }
  return compareText(b.createdAt, a.createdAt) || compareText(a.id, b.id);
}

/** One row per application. Status events for missing applications are ignored. */
export function applicationRows(
  data: Snapshot,
  labelOverrides?: Partial<Record<string, string>>,
): ApplicationRow[] {
  const companies = new Map(data.companies.map((c) => [c.id, c] as const));
  const eventsByApplication = new Map<Id, StatusEvent[]>();
  for (const event of data.statusEvents) {
    if (event.applicationId === undefined) continue;
    const group = eventsByApplication.get(event.applicationId);
    if (group) group.push(event);
    else eventsByApplication.set(event.applicationId, [event]);
  }

  const rows = data.applications.map((app): ApplicationRow => {
    const company =
      app.companyId === undefined ? undefined : companies.get(app.companyId);
    const events = eventsByApplication.get(app.id) ?? [];
    const current = currentStatus(events, app.id);
    // Restored records are not field-checked, so coerce every optional field.
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const status: unknown = current?.status;
    const row: ApplicationRow = {
      id: app.id,
      companyName: str(company?.name),
      title: str(app.title),
      notes: str(app.notes),
      statusLabel: statusLabel(
        typeof status === 'string' ? status : undefined,
        labelOverrides,
      ),
      archived: isArchived(current),
      createdAt: app.createdAt,
    };
    const url: unknown = app.url;
    if (typeof url === 'string' && url) row.url = url;
    const next: unknown = app.nextActionDate;
    if (typeof next === 'string' && next) row.nextActionDate = next;
    const actor: unknown = app.nextActor;
    if (actor === 'me' || actor === 'them') row.nextActor = actor;
    if (current) {
      if (typeof status === 'string') row.status = status;
      row.statusDate = effectiveDate(current);
    }
    return row;
  });
  return rows.sort(compareRows);
}

/** Keeps rows matching the scope (default 'active'), status key and search terms. */
export function filterRows(
  rows: readonly ApplicationRow[],
  filter: RowFilter,
): ApplicationRow[] {
  const scope = filter.scope ?? 'active';
  const terms = (filter.query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return rows.filter((row) => {
    if (scope === 'active' && row.archived) return false;
    if (scope === 'archived' && !row.archived) return false;
    if (filter.status !== undefined && row.status !== filter.status) {
      return false;
    }
    const fields = [row.companyName, row.title, row.notes].map((f) =>
      typeof f === 'string' ? f.toLowerCase() : '',
    );
    return terms.every((term) => fields.some((f) => f.includes(term)));
  });
}
