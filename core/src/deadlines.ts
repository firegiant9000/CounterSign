import { applicationRows } from './application-list';
import { addDays, compareLocalDate, isLocalDate } from './dates';
import { quietApplications } from './quiet';
import { isRoundKind, ROUND_KIND_LABELS } from './round-kinds';
import { noResponseDays } from './settings';
import type { Actor, Id, LocalDate, Settings, Snapshot } from './types';

export type DeadlineKind =
  'round' | 'task' | 'follow_up' | 'next_action' | 'quiet';

export interface DeadlineRow {
  key: string; // `${kind}:${id}`
  kind: DeadlineKind;
  date?: LocalDate;
  label: string;
  actor?: Actor;
  overdue: boolean;
  applicationId?: Id;
  taskId?: Id;
  contactId?: Id;
  roundId?: Id;
}

const KIND_ORDER: Record<DeadlineKind, number> = {
  round: 0,
  task: 1,
  follow_up: 2,
  next_action: 3,
  quiet: 4,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function appLabel(companyName: string, title: string): string {
  return `${companyName.trim() || 'Unknown company'} — ${title.trim() || 'Untitled'}`;
}

/** Open tasks, rounds, follow-ups, next actions and quiet applications on one list: dated rows first, then undated. */
export function deadlines(
  data: Snapshot,
  settings: Settings,
  today: LocalDate,
): DeadlineRow[] {
  const rows: DeadlineRow[] = [];
  const make = (row: Omit<DeadlineRow, 'overdue'>): void => {
    rows.push({
      ...row,
      overdue: row.date !== undefined && compareLocalDate(row.date, today) < 0,
    });
  };
  // Restored records are not field-checked, so every field is read as unknown.
  const apps = applicationRows(data);

  for (const round of data.rounds) {
    const date: unknown = round.date;
    const applicationId: unknown = round.applicationId;
    if (typeof date !== 'string' || !isLocalDate(date)) continue;
    if (compareLocalDate(date, today) < 0) continue; // past rounds drop off
    if (typeof applicationId !== 'string') continue;
    const app = apps.find((a) => a.id === applicationId);
    if (app === undefined || app.archived) continue;
    const kind: unknown = round.kind;
    const time: unknown = round.time;
    const kindLabel = isRoundKind(kind)
      ? ROUND_KIND_LABELS[kind]
      : ROUND_KIND_LABELS.other;
    const at =
      typeof time === 'string' && TIME_PATTERN.test(time) ? ` at ${time}` : '';
    make({
      key: `round:${round.id}`,
      kind: 'round',
      date,
      label: `${appLabel(app.companyName, app.title)}: ${kindLabel}${at}`,
      actor: 'me',
      applicationId: app.id,
      roundId: round.id,
    });
  }

  for (const task of data.tasks) {
    const doneAt: unknown = task.doneAt;
    if (typeof doneAt === 'string') continue;
    const title: unknown = task.title;
    const dueOn: unknown = task.dueOn;
    const row: Omit<DeadlineRow, 'overdue'> = {
      key: `task:${task.id}`,
      kind: 'task',
      label: (typeof title === 'string' && title.trim()) || 'Untitled task',
      actor: 'me',
      taskId: task.id,
    };
    if (typeof dueOn === 'string' && isLocalDate(dueOn)) row.date = dueOn;
    make(row);
  }

  const companies = new Map(data.companies.map((c) => [c.id, c] as const));
  for (const contact of data.contacts) {
    const on: unknown = contact.followUpOn;
    if (typeof on !== 'string' || !isLocalDate(on)) continue;
    const name: unknown = contact.name;
    const companyId: unknown = contact.companyId;
    const company =
      typeof companyId === 'string' ? companies.get(companyId) : undefined;
    const companyName: unknown = company?.name;
    const who =
      typeof name === 'string' && name.trim() ? name.trim() : 'Unnamed contact';
    const where =
      typeof companyName === 'string' && companyName.trim()
        ? companyName.trim()
        : 'Unknown company';
    make({
      key: `follow_up:${contact.id}`,
      kind: 'follow_up',
      date: on,
      label: `Follow up with ${who} at ${where}`,
      actor: 'me',
      contactId: contact.id,
    });
  }

  for (const app of apps) {
    if (app.archived) continue;
    const next = app.nextActionDate;
    if (next === undefined || !isLocalDate(next)) continue;
    const row: Omit<DeadlineRow, 'overdue'> = {
      key: `next_action:${app.id}`,
      kind: 'next_action',
      date: next,
      label: appLabel(app.companyName, app.title),
      applicationId: app.id,
    };
    if (app.nextActor !== undefined) row.actor = app.nextActor;
    make(row);
  }

  const cutoff = noResponseDays(settings);
  for (const q of quietApplications(data, cutoff, today)) {
    const date = addDays(q.statusDate, cutoff + 1);
    const row: Omit<DeadlineRow, 'overdue'> = {
      key: `quiet:${q.id}`,
      kind: 'quiet',
      label: `${appLabel(q.companyName, q.title)}: quiet for ${q.quietDays} days`,
      actor: 'me',
      applicationId: q.id,
    };
    if (date !== undefined) row.date = date;
    make(row);
  }

  return rows.sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === undefined) return 1;
      if (b.date === undefined) return -1;
      const byDate = compareLocalDate(a.date, b.date);
      if (byDate !== 0) return byDate;
    }
    return (
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      cmp(a.label, b.label) ||
      cmp(a.key, b.key)
    );
  });
}
