import { addStatusEventOps } from './application-ops';
import type { WriteOp } from './repository';
import { currentStatus } from './status';
import { newStatement, statementsFor } from './statements';
import type {
  AnswerValue,
  CanonicalAnswer,
  Deps,
  Id,
  LocalDate,
  Snapshot,
} from './types';

export interface ToldPanel {
  unrecorded: CanonicalAnswer[];
  offerApplied: boolean;
  missing: boolean;
}

// Restored records are not field-checked, so a value may be null, a primitive or an array.
function isPlainObject(value: unknown): value is AnswerValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applicationExists(data: Snapshot, applicationId: Id): boolean {
  return data.applications.some((a) => a.id === applicationId);
}

/**
 * The canonical answers this application has no statement for yet, first record
 * per key, in canonical order. Malformed answers are skipped, never thrown on.
 */
export function toldPanel(data: Snapshot, applicationId: Id): ToldPanel {
  if (!applicationExists(data, applicationId)) {
    return { unrecorded: [], offerApplied: false, missing: true };
  }

  const stated = new Set(
    statementsFor(data, applicationId).map((s) => s.answerKey),
  );
  const seen = new Set<string>();
  const unrecorded: CanonicalAnswer[] = [];
  for (const answer of data.canonicalAnswers) {
    const key: unknown = answer.key;
    if (typeof key !== 'string' || key === '') continue;
    if (!isPlainObject(answer.value)) continue;
    if (stated.has(key) || seen.has(key)) continue;
    seen.add(key);
    unrecorded.push(answer);
  }

  const current = currentStatus(data.statusEvents, applicationId);
  const offerApplied = current === undefined || current.status === 'interested';
  return { unrecorded, offerApplied, missing: false };
}

/** One hand-ticked statement per ticked key still unrecorded. Other keys are ignored. */
export function recordTickedOps(
  data: Snapshot,
  applicationId: Id,
  answerKeys: readonly string[],
  deps: Deps,
): { ops: WriteOp[]; missing: boolean } {
  const panel = toldPanel(data, applicationId);
  if (panel.missing) return { ops: [], missing: true };

  const ticked = new Set(answerKeys);
  const ops: WriteOp[] = panel.unrecorded
    .filter((answer) => ticked.has(answer.key ?? ''))
    .map((answer): WriteOp => ({
      kind: 'put',
      store: 'statements',
      record: newStatement(answer, applicationId, deps),
    }));
  return { ops, missing: false };
}

/** Marks the application applied on `today`, only when the panel offers it. */
export function markAppliedOps(
  data: Snapshot,
  applicationId: Id,
  today: LocalDate,
  deps: Deps,
): { ops: WriteOp[]; eventId?: Id; missing: boolean } {
  const panel = toldPanel(data, applicationId);
  if (panel.missing) return { ops: [], missing: true };
  if (!panel.offerApplied) return { ops: [], missing: false };

  const ops = addStatusEventOps(
    applicationId,
    { status: 'applied', occurredOn: today },
    deps,
  );
  const eventOp = ops.find(
    (op): op is Extract<WriteOp, { kind: 'put'; store: 'statusEvents' }> =>
      op.kind === 'put' && op.store === 'statusEvents',
  );
  return { ops, eventId: eventOp?.record.id, missing: false };
}
