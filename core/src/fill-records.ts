import { updateApplicationOps } from './application-ops';
import type { FillResult } from './fill/result';
import { isSiteType } from './formhand';
import type { WriteOp } from './repository';
import { statementsFor } from './statements';
import type { Deps, Id, Snapshot, Statement } from './types';

export const MAX_QUESTION = 300;

export interface FillRecord {
  ops: WriteOp[];
  recorded: number;
  alreadyOnForm: number;
  missing: boolean;
}

// Restored records are not field-checked, so a value may be null, a primitive or an array.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MONEY_FIELDS = ['min', 'max', 'currency', 'period'] as const;

/** Same type and equal fields for that type. Anything that is not a plain object is never equal. */
export function sameAnswerValue(a: unknown, b: unknown): boolean {
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'money_range') {
    return MONEY_FIELDS.every((field) => a[field] === b[field]);
  }
  return a.value === b.value;
}

/**
 * The "what I told them" statements a fill implies, plus a site-type update,
 * as one op list. Never throws on odd restored data.
 */
export function fillRecordOps(
  data: Snapshot,
  result: FillResult,
  applicationId: Id,
  deps: Deps,
): FillRecord {
  const app = data.applications.find((a) => a.id === applicationId);
  if (app === undefined) {
    return { ops: [], recorded: 0, alreadyOnForm: 0, missing: true };
  }

  const told: { key: string; value: unknown }[] = statementsFor(
    data,
    applicationId,
  ).flatMap((s) =>
    typeof s.answerKey === 'string'
      ? [{ key: s.answerKey, value: s.value }]
      : [],
  );

  const ops: WriteOp[] = [];
  let recorded = 0;
  let alreadyOnForm = 0;

  for (const row of result.rows) {
    if (row.target?.kind !== 'answer') continue;
    const value: unknown = row.answerValue;
    if (!isPlainObject(value)) continue;
    const written = row.status === 'will_fill' && row.outcome === 'written';
    const matches = row.status === 'matches';
    if (!written && !matches) continue;

    const key = row.target.key;
    if (told.some((t) => t.key === key && sameAnswerValue(t.value, value))) {
      continue;
    }
    told.push({ key, value });

    const statement: Statement = {
      id: deps.newId(),
      createdAt: deps.now(),
      applicationId,
      answerKey: key,
      value: { ...value } as Statement['value'],
      source: 'fill',
    };
    const question =
      typeof row.label === 'string'
        ? row.label.trim().slice(0, MAX_QUESTION)
        : '';
    if (question !== '') statement.question = question;

    ops.push({ kind: 'put', store: 'statements', record: statement });
    recorded += 1;
    if (matches) alreadyOnForm += 1;
  }

  if (!isSiteType(app.siteType) && result.siteType !== 'other') {
    ops.push(...updateApplicationOps(app, { siteType: result.siteType }));
  }

  return { ops, recorded, alreadyOnForm, missing: false };
}
