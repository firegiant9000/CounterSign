import { toLocalDate } from './dates';
import {
  findApplicationMatch,
  repostFact,
  type ApplicationMatch,
  type JobCandidate,
} from './duplicates';
import type { FillResult } from './fill/result';
import { fillRecordOps, type FillRecord } from './fill-records';
import { formUrlKey, linkFormOps } from './form-link';
import {
  createApplicationFromJobOps,
  saveJobOps,
  type JobInput,
} from './job-ops';
import type { WriteOp } from './repository';
import type { Application, Deps, Id, Job, Snapshot } from './types';

/**
 * Link an application to a form and, with a held fill result, record that fill
 * on it, as one op list. Both writes put the whole application, so the record
 * step runs on a snapshot that already carries the link; otherwise the later
 * put would drop the earlier one's change.
 */
export function linkFormAndRecordOps(
  data: Snapshot,
  applicationId: Id,
  key: string,
  held: FillResult | undefined,
  deps: Deps,
): { ops: WriteOp[]; record?: FillRecord } {
  const ops = linkFormOps(data, applicationId, key);
  if (held === undefined) return { ops };
  const replaced = new Map<Id, Application>();
  for (const op of ops) {
    if (op.kind === 'put' && op.store === 'applications') {
      replaced.set(op.record.id, op.record);
    }
  }
  const next: Snapshot = {
    ...data,
    applications: data.applications.map((a) => replaced.get(a.id) ?? a),
  };
  const record = fillRecordOps(next, held, applicationId, deps);
  return { ops: [...ops, ...record.ops], record };
}

/**
 * A job, an application from it and, with a held fill result, the statements
 * and site type that fill implies, as one op list for a single apply.
 * Order: company (if new), job, application, status event, statements, site type.
 */
export function newApplicationFromFormOps(
  data: Snapshot,
  input: JobInput,
  deps: Deps,
  held?: FillResult,
): {
  ops: WriteOp[];
  applicationId: Id;
  record?: FillRecord;
  match?: ApplicationMatch['kind'];
  repost?: string;
} {
  const saved = saveJobOps(input, deps);
  const jobPut = saved.ops[0];
  if (jobPut?.kind !== 'put' || jobPut.store !== 'jobs') {
    throw new Error('saveJobOps returned no job put');
  }
  const job: Job = { ...jobPut.record };
  if (typeof input.url === 'string') {
    const key = formUrlKey(input.url, input.relCanonical);
    if (key !== undefined) job.canonicalUrl = key;
  }
  const jobOp: WriteOp = { kind: 'put', store: 'jobs', record: job };

  const created = createApplicationFromJobOps(job, data, deps);
  const companyIndex = created.ops.findIndex(
    (op) => op.kind === 'put' && op.store === 'companies',
  );
  const ops: WriteOp[] = [...created.ops];
  ops.splice(companyIndex + 1, 0, jobOp);

  // Facts only inform, as in Save job: computed on the data before this write,
  // for a candidate stored the way the job is (form key as its canonical URL).
  const candidate: JobCandidate = {};
  if (job.canonicalUrl !== undefined) candidate.canonicalUrl = job.canonicalUrl;
  if (job.companyName !== undefined) candidate.companyName = job.companyName;
  if (job.title !== undefined) candidate.title = job.title;
  const match = findApplicationMatch(data, candidate)?.kind;
  const repost = repostFact(
    data,
    { ...candidate, excludeJobId: job.id },
    toLocalDate(new Date(deps.now())),
  )?.text;
  const facts = {
    ...(match !== undefined ? { match } : {}),
    ...(repost !== undefined ? { repost } : {}),
  };

  if (held === undefined) {
    return { ops, applicationId: created.applicationId, ...facts };
  }

  const next: Snapshot = {
    ...data,
    companies: [...data.companies],
    jobs: [...data.jobs, job],
    applications: [...data.applications],
    statusEvents: [...data.statusEvents],
  };
  for (const op of created.ops) {
    if (op.kind !== 'put') continue;
    if (op.store === 'companies') next.companies.push(op.record);
    else if (op.store === 'applications') {
      next.applications.push(op.record);
    } else if (op.store === 'statusEvents') {
      next.statusEvents.push(op.record);
    }
  }
  const record = fillRecordOps(next, held, created.applicationId, deps);
  ops.push(...record.ops);
  return { ops, applicationId: created.applicationId, record, ...facts };
}
