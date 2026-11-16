import { applicationRows } from './application-list';
import { addDays, compareLocalDate, isLocalDate } from './dates';
import { quietApplications } from './quiet';
import { noResponseDays } from './settings';
import type { Actor, Id, LocalDate, Settings, Snapshot } from './types';

export type DeadlineKind = 'task' | 'next_action' | 'quiet';

export interface DeadlineRow {
  key: string; // `${kind}:${id}`
  kind: DeadlineKind;
  date?: LocalDate;
  label: string;
  actor?: Actor;
  overdue: boolean;
  applicationId?: Id;
  taskId?: Id;
}

const KIND_ORDER: Record<DeadlineKind, number> = {
  task: 0,
  next_action: 1,
  quiet: 2,
};

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function appLabel(companyName: string, title: string): string {
  return `${companyName.trim() || 'Unknown company'} — ${title.trim() || 'Untitled'}`;
}

/** Open tasks, next actions and quiet applications on one list: dated rows first, then undated. */
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

  for (const app of applicationRows(data)) {
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
