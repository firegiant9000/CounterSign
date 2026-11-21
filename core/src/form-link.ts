import type { WriteOp } from './repository';
import { currentStatus, isArchived } from './status';
import type { Application, Id, Snapshot } from './types';
import { canonicalizeUrl } from './url';

// core/ declares no URL global (lib ES2023, types []), so declare the subset used here.
interface UrlLike {
  protocol: string;
  hostname: string;
}
declare const URL: { new (url: string, base?: string): UrlLike };

export const MAX_FORM_URLS = 20;

// Hosts whose application form lives one path segment below the posting.
const TRAILING_SEGMENTS: Readonly<Record<string, string>> = {
  'jobs.lever.co': 'apply',
  'jobs.eu.lever.co': 'apply',
  'jobs.ashbyhq.com': 'application',
};

/** The key a form is stored and matched under, or undefined for a non-http(s) address. Never throws. */
export function formUrlKey(
  url: string,
  relCanonical?: string,
): string | undefined {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    const canonical = canonicalizeUrl(url, relCanonical);
    const canonicalUrl = new URL(canonical);
    const segment = TRAILING_SEGMENTS[canonicalUrl.hostname.toLowerCase()];
    if (segment === undefined) return canonical;
    const queryIndex = canonical.indexOf('?');
    const base = queryIndex >= 0 ? canonical.slice(0, queryIndex) : canonical;
    const query = queryIndex >= 0 ? canonical.slice(queryIndex) : '';
    const trimmed = base.replace(/\/+$/, '');
    const suffix = `/${segment}`;
    if (!trimmed.endsWith(suffix)) return canonical;
    return trimmed.slice(0, -suffix.length) + query;
  } catch {
    return undefined;
  }
}

function formUrlsOf(app: Application): string[] {
  const raw: unknown = app.formUrls;
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string')
    : [];
}

function newestFirst(a: Application, b: Application): number {
  const x = typeof a.createdAt === 'string' ? a.createdAt : '';
  const y = typeof b.createdAt === 'string' ? b.createdAt : '';
  return x < y ? 1 : x > y ? -1 : 0;
}

/** Active applications a form may belong to, best first: saved form addresses, then job link, then own URL. */
export function findApplicationsForForm(data: Snapshot, key: string): Id[] {
  const jobUrls = new Map<Id, string>();
  for (const job of data.jobs) {
    if (typeof job.canonicalUrl === 'string')
      jobUrls.set(job.id, job.canonicalUrl);
  }
  const active = data.applications
    .filter((a) => !isArchived(currentStatus(data.statusEvents, a.id)))
    .sort(newestFirst);

  const byForm = active.filter((a) => formUrlsOf(a).includes(key));
  const byJob = active.filter((a) => {
    if (typeof a.jobId !== 'string') return false;
    const url = jobUrls.get(a.jobId);
    return url !== undefined && (formUrlKey(url) ?? url) === key;
  });
  const byUrl = active.filter(
    (a) => typeof a.url === 'string' && formUrlKey(a.url) === key,
  );

  const seen = new Set<Id>();
  const result: Id[] = [];
  for (const a of [...byForm, ...byJob, ...byUrl]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    result.push(a.id);
  }
  return result;
}

/** Links a form to an application, moving the key off any other application that held it. */
export function linkFormOps(
  data: Snapshot,
  applicationId: Id,
  key: string,
): WriteOp[] {
  const target = data.applications.find((a) => a.id === applicationId);
  if (!target) return [];
  const ops: WriteOp[] = [];

  const held = formUrlsOf(target);
  if (!held.includes(key)) {
    const next = [...held, key].slice(-MAX_FORM_URLS);
    ops.push({
      kind: 'put',
      store: 'applications',
      record: { ...target, formUrls: next },
    });
  }

  for (const other of data.applications) {
    if (other.id === applicationId) continue;
    const urls = formUrlsOf(other);
    if (!urls.includes(key)) continue;
    const record: Application = { ...other };
    const rest = urls.filter((u) => u !== key);
    if (rest.length > 0) record.formUrls = rest;
    else delete record.formUrls;
    ops.push({ kind: 'put', store: 'applications', record });
  }
  return ops;
}
