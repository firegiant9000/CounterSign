import { newApplicationOps } from './application-ops';
import { MAX_POSTING_TEXT } from './jobposting';
import type { WriteOp } from './repository';
import { canonicalizeUrl } from './url';
import type { CaptureSource, Deps, Id, Job, Snapshot } from './types';

export interface JobInput {
  source: CaptureSource;
  url?: string;
  relCanonical?: string;
  title?: string;
  companyName?: string;
  location?: string;
  text?: string;
}

/** Trimmed value, or undefined when absent or blank. */
function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function saveJobOps(
  input: JobInput,
  deps: Deps,
): { ops: WriteOp[]; jobId: Id } {
  const job: Job = {
    id: deps.newId(),
    createdAt: deps.now(),
    source: input.source,
  };
  const title = clean(input.title);
  if (title !== undefined) job.title = title;
  const companyName = clean(input.companyName);
  if (companyName !== undefined) job.companyName = companyName;
  const location = clean(input.location);
  if (location !== undefined) job.location = location;
  const text = clean(input.text);
  if (text !== undefined) job.text = text.slice(0, MAX_POSTING_TEXT);
  const relCanonical = clean(input.relCanonical);
  if (relCanonical !== undefined) job.relCanonical = relCanonical;
  const url = clean(input.url);
  if (url !== undefined) {
    job.url = url;
    job.canonicalUrl = canonicalizeUrl(url, input.relCanonical);
  }
  return { ops: [{ kind: 'put', store: 'jobs', record: job }], jobId: job.id };
}

export function createApplicationFromJobOps(
  job: Job,
  data: Snapshot,
  deps: Deps,
): { ops: WriteOp[]; applicationId: Id } {
  const { ops, applicationId } = newApplicationOps(
    {
      companyName: job.companyName,
      title: job.title,
      url: job.url,
      status: 'interested',
    },
    data,
    deps,
  );
  const linked = ops.map((op): WriteOp => {
    if (op.kind === 'put' && op.store === 'applications') {
      return { ...op, record: { ...op.record, jobId: job.id } };
    }
    return op;
  });
  return { ops: linked, applicationId };
}
