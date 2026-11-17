import {
  findCompanyByName,
  findOrCreateCompanyOps,
  normalizeName,
} from './application-ops';
import { contactsAt } from './contacts';
import type { WriteOp } from './repository';
import type { Company, Contact, Deps, Job, Snapshot } from './types';

export function isTarget(company: Company): boolean {
  return (company as { isTarget?: unknown }).isTarget === true;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function flagTargetByNameOps(
  data: Snapshot,
  name: string,
  deps: Deps,
): WriteOp[] {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Enter a company name.');
  }
  const found = findCompanyByName(data.companies, name);
  if (found) {
    if (isTarget(found)) return [];
    return [
      {
        kind: 'put',
        store: 'companies',
        record: { ...found, isTarget: true },
      },
    ];
  }
  const { ops } = findOrCreateCompanyOps(data, name, deps);
  const op = ops[0];
  if (ops.length !== 1 || op?.kind !== 'put' || op.store !== 'companies') {
    throw new Error('Expected a new company record.');
  }
  return [
    {
      kind: 'put',
      store: 'companies',
      record: { ...op.record, isTarget: true },
    },
  ];
}

export function setTargetOps(company: Company, flag: boolean): WriteOp[] {
  if (flag) {
    if (company.isTarget === true) return [];
    return [
      {
        kind: 'put',
        store: 'companies',
        record: { ...company, isTarget: true },
      },
    ];
  }
  if (!('isTarget' in company)) return [];
  const record: Company = { ...company };
  delete record.isTarget;
  return [{ kind: 'put', store: 'companies', record }];
}

export interface TargetRow {
  company: Company;
  contacts: Contact[];
  jobs: Job[];
}

function nameKey(company: Company): string | undefined {
  const name = text(company.name);
  if (name === undefined || name.trim() === '') return undefined;
  return normalizeName(name);
}

function compareCompanies(a: Company, b: Company): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (ka !== kb) {
    if (ka === undefined) return 1;
    if (kb === undefined) return -1;
    return ka < kb ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareJobsNewestFirst(a: Job, b: Job): number {
  const ca = text(a.createdAt) ?? '';
  const cb = text(b.createdAt) ?? '';
  if (ca !== cb) return ca < cb ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function targetCompanies(data: Snapshot): TargetRow[] {
  return data.companies
    .filter((c) => isTarget(c))
    .sort(compareCompanies)
    .map((company) => {
      const key = nameKey(company);
      const jobs =
        key === undefined
          ? []
          : data.jobs
              .filter((j) => {
                const jobName = text(j.companyName);
                return jobName !== undefined && normalizeName(jobName) === key;
              })
              .sort(compareJobsNewestFirst);
      return { company, contacts: contactsAt(data, company.id), jobs };
    });
}
