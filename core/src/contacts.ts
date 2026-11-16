import { findCompanyByName, findOrCreateCompanyOps } from './application-ops';
import type { WriteOp } from './repository';
import type { Contact, Deps, Id, Snapshot } from './types';

export type AnyoneHere = 'show_contacts' | 'ask' | 'none';

export interface ContactInput {
  name?: string;
  role?: string;
  howKnown?: string;
  notes?: string;
}

const FIELDS = ['name', 'role', 'howKnown', 'notes'] as const;

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sortKey(c: Contact): string | undefined {
  const name = text((c as { name?: unknown }).name)?.trim();
  return name ? name.toLowerCase() : undefined;
}

export function contactsAt(data: Snapshot, companyId: Id): Contact[] {
  return data.contacts
    .filter((c) => c.companyId === companyId)
    .sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka !== kb) {
        if (ka === undefined) return 1;
        if (kb === undefined) return -1;
        return ka < kb ? -1 : 1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function anyoneHerePrompt(
  data: Snapshot,
  companyId: Id | undefined,
): AnyoneHere {
  if (companyId === undefined) return 'none';
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) return 'none';
  if (data.contacts.some((c) => c.companyId === companyId)) {
    return 'show_contacts';
  }
  const answer: unknown = (company as { anyoneHere?: unknown }).anyoneHere;
  return answer === 'checked_nobody' ? 'none' : 'ask';
}

export function anyoneHereForName(
  data: Snapshot,
  companyName: string | undefined,
): { prompt: AnyoneHere; companyId?: Id } {
  if (companyName === undefined || companyName.trim() === '') {
    return { prompt: 'none' };
  }
  const company = findCompanyByName(data.companies, companyName);
  if (!company) return { prompt: 'ask' };
  return {
    prompt: anyoneHerePrompt(data, company.id),
    companyId: company.id,
  };
}

export function addContactOps(
  data: Snapshot,
  companyName: string,
  input: ContactInput,
  deps: Deps,
): { ops: WriteOp[]; contactId: Id } {
  const found = findOrCreateCompanyOps(data, companyName, deps);
  if (found.companyId === undefined) throw new Error('Enter a company name.');
  const contact: Contact = {
    id: deps.newId(),
    createdAt: deps.now(),
    companyId: found.companyId,
  };
  for (const key of FIELDS) {
    const value = text(input[key])?.trim();
    if (value) contact[key] = value;
  }
  return {
    ops: [...found.ops, { kind: 'put', store: 'contacts', record: contact }],
    contactId: contact.id,
  };
}

export function updateContactOps(
  contact: Contact,
  patch: ContactInput,
): WriteOp[] {
  const record: Contact = { ...contact };
  for (const key of FIELDS) {
    if (!(key in patch)) continue;
    const value = text(patch[key])?.trim();
    if (value) record[key] = value;
    else delete record[key];
  }
  return [{ kind: 'put', store: 'contacts', record }];
}

export function deleteContactOps(data: Snapshot, contactId: Id): WriteOp[] {
  const ops: WriteOp[] = data.contactEvents
    .filter((e) => e.contactId === contactId)
    .map((e) => ({ kind: 'delete', store: 'contactEvents', id: e.id }));
  ops.push({ kind: 'delete', store: 'contacts', id: contactId });
  return ops;
}

export function markCheckedNobodyOps(
  data: Snapshot,
  companyName: string,
  deps: Deps,
): WriteOp[] {
  const found = findOrCreateCompanyOps(data, companyName, deps);
  if (found.companyId === undefined) return [];
  const stored = data.companies.find((c) => c.id === found.companyId);
  const created = found.ops[0];
  const base =
    stored ??
    (created?.kind === 'put' && created.store === 'companies'
      ? created.record
      : undefined);
  if (!base) return [];
  const answer: unknown = (base as { anyoneHere?: unknown }).anyoneHere;
  if (answer === 'checked_nobody') return [];
  return [
    {
      kind: 'put',
      store: 'companies',
      record: { ...base, anyoneHere: 'checked_nobody' },
    },
  ];
}
