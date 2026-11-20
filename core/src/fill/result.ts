import type { SiteType } from '../formhand';
import { canonicalizeUrl } from '../url';
import type { AnswerValue, IsoInstant } from '../types';
import { siteTypeForUrl } from './site';
import type {
  FillPlan,
  FillTarget,
  NotFilledReason,
  RowStatus,
  WriteOutcome,
  WriteReport,
} from './types';

export interface FillResultRow {
  label: string;
  target?: FillTarget;
  status: RowStatus;
  reason?: NotFilledReason;
  outcome?: WriteOutcome;
  answerValue?: AnswerValue;
}

export interface FillResult {
  url: string;
  siteType: SiteType;
  at: IsoInstant;
  rows: FillResultRow[];
}

/**
 * Turns a fill plan and the page's write reports into the record kept for a
 * later feature. The first report for a ref wins; reports for unknown refs are
 * ignored. Only will_fill rows get an outcome. Never changes its arguments.
 */
export function buildFillResult(args: {
  tabUrl: string;
  relCanonical?: string;
  at: IsoInstant;
  plan: FillPlan;
  outcomes: readonly WriteReport[];
}): FillResult {
  const reported = new Map<number, WriteOutcome>();
  for (const report of args.outcomes) {
    if (!reported.has(report.ref)) {
      reported.set(report.ref, report.outcome);
    }
  }

  const rows = args.plan.rows.map((row): FillResultRow => {
    const result: FillResultRow = { label: row.label, status: row.status };
    if (row.target !== undefined) result.target = row.target;
    if (row.reason !== undefined) result.reason = row.reason;
    if (row.status === 'will_fill') {
      result.outcome = reported.get(row.ref) ?? 'failed';
    }
    if (row.answerValue !== undefined) result.answerValue = row.answerValue;
    return result;
  });

  return {
    url: canonicalizeUrl(args.tabUrl, args.relCanonical),
    siteType: siteTypeForUrl(args.tabUrl),
    at: args.at,
    rows,
  };
}
