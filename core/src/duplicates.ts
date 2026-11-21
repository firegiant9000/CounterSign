import { normalizeName } from './application-ops';
import { isLocalDate, toLocalDate } from './dates';
import { formUrlKey } from './form-link';
import type { Application, Id, Job, LocalDate, Snapshot } from './types';
import { canonicalizeUrl } from './url';

export interface JobCandidate {
  canonicalUrl?: string;
  companyName?: string;
  title?: string;
}
export type ApplicationMatch = {
  kind: 'already_applied' | 'possible_match';
  applicationId: Id;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function nameKey(value: unknown): string | undefined {
  const s = str(value);
  return s === undefined ? undefined : normalizeName(s);
}

function safeCanonical(url: string): string | undefined {
  try {
    return str(canonicalizeUrl(url));
  } catch {
    return undefined;
  }
}

// Equal, or both the same posting once a form's apply segment is dropped.
function urlsMatch(have: string | undefined, want: string): boolean {
  if (have === undefined) return false;
  if (have === want) return true;
  const key = formUrlKey(want);
  return key !== undefined && key === formUrlKey(have);
}

function applicationCanonicalUrl(
  app: Application,
  jobsById: Map<Id, Job>,
): string | undefined {
  if (typeof app.jobId === 'string') {
    const linked = str(jobsById.get(app.jobId)?.canonicalUrl);
    if (linked !== undefined) return linked;
  }
  const url = str(app.url);
  return url === undefined ? undefined : safeCanonical(url);
}

// A shared URL is contradicted when both sides name a company (or a title)
// and the names differ. A side with no name never contradicts.
function contradicts(
  wantCompany: string | undefined,
  haveCompany: string | undefined,
  wantTitle: string | undefined,
  haveTitle: string | undefined,
): boolean {
  if (
    wantCompany !== undefined &&
    haveCompany !== undefined &&
    wantCompany !== haveCompany
  ) {
    return true;
  }
  return (
    wantTitle !== undefined &&
    haveTitle !== undefined &&
    wantTitle !== haveTitle
  );
}

function createdAtMs(createdAt: unknown): number {
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

export function findApplicationMatch(
  data: Snapshot,
  candidate: JobCandidate,
): ApplicationMatch | undefined {
  const jobsById = new Map<Id, Job>();
  for (const job of data.jobs) jobsById.set(job.id, job);
  const companyNames = new Map<Id, string | undefined>();
  for (const company of data.companies) {
    companyNames.set(company.id, nameKey(company.name));
  }

  const wantUrl = str(candidate.canonicalUrl);
  const wantCompany = nameKey(candidate.companyName);
  const wantTitle = nameKey(candidate.title);

  let applied: Application | undefined;
  let possible: Application | undefined;
  for (const app of data.applications) {
    const url = applicationCanonicalUrl(app, jobsById);
    const company =
      typeof app.companyId === 'string'
        ? companyNames.get(app.companyId)
        : undefined;
    const appTitle = nameKey(app.title);
    if (
      wantUrl !== undefined &&
      urlsMatch(url, wantUrl) &&
      !contradicts(wantCompany, company, wantTitle, appTitle)
    ) {
      if (
        !applied ||
        createdAtMs(app.createdAt) >= createdAtMs(applied.createdAt)
      ) {
        applied = app;
      }
      continue;
    }
    if (wantCompany === undefined || wantTitle === undefined) continue;
    if (company === wantCompany && appTitle === wantTitle) {
      if (
        !possible ||
        createdAtMs(app.createdAt) >= createdAtMs(possible.createdAt)
      ) {
        possible = app;
      }
    }
  }
  if (applied) return { kind: 'already_applied', applicationId: applied.id };
  if (possible) return { kind: 'possible_match', applicationId: possible.id };
  return undefined;
}

function dayNumber(date: LocalDate): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function agoText(first: LocalDate, today: LocalDate): string {
  const days = dayNumber(today) - dayNumber(first);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  const [fy = 0, fm = 1, fd = 1] = first.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = today.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  if (months < 1) return `${days} days ago`;
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export function repostFact(
  data: Snapshot,
  candidate: JobCandidate & { excludeJobId?: Id },
  today: LocalDate,
): { firstSavedOn: LocalDate; text: string } | undefined {
  if (typeof today !== 'string' || !isLocalDate(today)) return undefined;
  const wantUrl = str(candidate.canonicalUrl);
  const wantCompany = nameKey(candidate.companyName);
  const wantTitle = nameKey(candidate.title);

  let best: { date: LocalDate; ms: number; viaUrl: boolean } | undefined;
  for (const job of data.jobs) {
    if (job.id === candidate.excludeJobId) continue;
    const jobCompany = nameKey(job.companyName);
    const jobTitle = nameKey(job.title);
    const sameUrl =
      wantUrl !== undefined &&
      urlsMatch(str(job.canonicalUrl), wantUrl) &&
      !contradicts(wantCompany, jobCompany, wantTitle, jobTitle);
    const sameName =
      wantCompany !== undefined &&
      wantTitle !== undefined &&
      jobCompany === wantCompany &&
      jobTitle === wantTitle;
    if (!sameUrl && !sameName) continue;
    const ms = createdAtMs(job.createdAt);
    if (ms === -Infinity) continue;
    const date = toLocalDate(new Date(ms));
    if (!isLocalDate(date)) continue;
    if (!best || ms < best.ms) best = { date, ms, viaUrl: sameUrl };
  }
  if (!best) return undefined;

  const [fy = 0, fm = 1, fd = 1] = best.date.split('-').map(Number);
  const ty = Number(today.slice(0, 4));
  const year = fy === ty ? '' : ` ${fy}`;
  const when = `${fd} ${MONTHS[fm - 1] ?? ''}${year} (${agoText(best.date, today)})`;
  return {
    firstSavedOn: best.date,
    text: best.viaUrl
      ? `You saved this posting on ${when}.`
      : `You saved a posting with the same company and title on ${when}.`,
  };
}
