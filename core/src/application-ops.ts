import type { WriteOp } from './repository';
import type { StatusKey } from './status';
import type {
  Actor,
  Application,
  Company,
  Deps,
  Id,
  LocalDate,
  Snapshot,
  StatusEvent,
} from './types';

export interface NewApplicationInput {
  companyName?: string;
  title?: string;
  url?: string;
  status?: StatusKey;
  occurredOn?: LocalDate;
  nextActionDate?: LocalDate;
  nextActor?: Actor;
  notes?: string;
  note?: string;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function collapse(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeName(name: string): string {
  return collapse(name).toLowerCase();
}

export function findCompanyByName(
  companies: readonly Company[],
  name: string,
): Company | undefined {
  const wanted = normalizeName(name);
  return companies.find(
    (c) => typeof c.name === 'string' && normalizeName(c.name) === wanted,
  );
}

export function findOrCreateCompanyOps(
  data: Snapshot,
  name: string,
  deps: Deps,
): { ops: WriteOp[]; companyId: Id | undefined } {
  if (isBlank(name)) return { ops: [], companyId: undefined };
  const existing = findCompanyByName(data.companies, name);
  if (existing) return { ops: [], companyId: existing.id };
  const company: Company = {
    id: deps.newId(),
    createdAt: deps.now(),
    name: collapse(name),
  };
  return {
    ops: [{ kind: 'put', store: 'companies', record: company }],
    companyId: company.id,
  };
}

export function newApplicationOps(
  input: NewApplicationInput,
  data: Snapshot,
  deps: Deps,
): { ops: WriteOp[]; applicationId: Id } {
  const found = findOrCreateCompanyOps(data, input.companyName ?? '', deps);
  const ops: WriteOp[] = [...found.ops];
  const companyId = found.companyId;

  const app: Application = { id: deps.newId(), createdAt: deps.now() };
  if (companyId !== undefined) app.companyId = companyId;
  if (input.title !== undefined && !isBlank(input.title))
    app.title = input.title.trim();
  if (input.url !== undefined && !isBlank(input.url))
    app.url = input.url.trim();
  if (input.nextActionDate !== undefined && !isBlank(input.nextActionDate)) {
    app.nextActionDate = input.nextActionDate;
  }
  if (input.nextActor !== undefined) app.nextActor = input.nextActor;
  if (input.notes !== undefined && !isBlank(input.notes))
    app.notes = input.notes;
  ops.push({ kind: 'put', store: 'applications', record: app });

  const event: StatusEvent = {
    id: deps.newId(),
    createdAt: deps.now(),
    applicationId: app.id,
    status: input.status ?? 'interested',
  };
  if (input.occurredOn !== undefined && !isBlank(input.occurredOn)) {
    event.occurredOn = input.occurredOn;
  }
  if (input.note !== undefined && !isBlank(input.note)) event.note = input.note;
  ops.push({ kind: 'put', store: 'statusEvents', record: event });

  return { ops, applicationId: app.id };
}

export type ApplicationPatch = Partial<Omit<Application, 'id' | 'createdAt'>>;

export function updateApplicationOps(
  app: Application,
  patch: ApplicationPatch,
): WriteOp[] {
  const record: Record<string, unknown> = { ...app };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'createdAt') continue;
    if (
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      delete record[key];
    } else if (
      (key === 'title' || key === 'url') &&
      typeof value === 'string'
    ) {
      record[key] = value.trim();
    } else {
      record[key] = value;
    }
  }
  return [
    {
      kind: 'put',
      store: 'applications',
      record: record as unknown as Application,
    },
  ];
}

export function addStatusEventOps(
  applicationId: Id,
  input: { status: StatusKey; occurredOn?: LocalDate; note?: string },
  deps: Deps,
): WriteOp[] {
  const event: StatusEvent = {
    id: deps.newId(),
    createdAt: deps.now(),
    applicationId,
    status: input.status,
  };
  if (input.occurredOn !== undefined && !isBlank(input.occurredOn)) {
    event.occurredOn = input.occurredOn;
  }
  if (input.note !== undefined && !isBlank(input.note)) event.note = input.note;
  return [{ kind: 'put', store: 'statusEvents', record: event }];
}

export function voidStatusEventOps(event: StatusEvent, deps: Deps): WriteOp[] {
  return [
    {
      kind: 'put',
      store: 'statusEvents',
      record: { ...event, voidedAt: deps.now() },
    },
  ];
}

export function deleteApplicationOps(
  data: Snapshot,
  applicationId: Id,
): WriteOp[] {
  const ops: WriteOp[] = data.statusEvents
    .filter((e) => e.applicationId === applicationId)
    .map((e): WriteOp => ({ kind: 'delete', store: 'statusEvents', id: e.id }));
  for (const s of data.statements) {
    if (s.applicationId === applicationId) {
      ops.push({ kind: 'delete', store: 'statements', id: s.id });
    }
  }
  for (const r of data.rounds) {
    if (r.applicationId === applicationId) {
      ops.push({ kind: 'delete', store: 'rounds', id: r.id });
    }
  }
  for (const ev of data.contactEvents) {
    if (ev.applicationId === applicationId) {
      const record = { ...ev };
      delete record.applicationId;
      ops.push({ kind: 'put', store: 'contactEvents', record });
    }
  }
  for (const c of data.contacts) {
    if (c.followUpApplicationId === applicationId) {
      const record = { ...c };
      delete record.followUpApplicationId;
      ops.push({ kind: 'put', store: 'contacts', record });
    }
  }
  ops.push({ kind: 'delete', store: 'applications', id: applicationId });
  return ops;
}
