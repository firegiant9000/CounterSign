import { reviseAnswer } from './answers';
import type { WriteOp } from './repository';
import type {
  AnswerValue,
  CanonicalAnswer,
  Deps,
  Id,
  Snapshot,
  Statement,
} from './types';

// Restored records are not field-checked, so a value may be null, a primitive or an array.
function isPlainObject(value: unknown): value is AnswerValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Entries for one application, oldest first (createdAt, then id). */
export function statementsFor(data: Snapshot, applicationId: Id): Statement[] {
  const key = (s: Statement): string =>
    typeof s.createdAt === 'string' ? s.createdAt : '';
  return data.statements
    .filter((s) => s.applicationId === applicationId)
    .sort((a, b) => {
      const byTime = key(a).localeCompare(key(b));
      return byTime !== 0 ? byTime : String(a.id).localeCompare(String(b.id));
    });
}

/** A draft entry seeded from the canonical answer. Not written. */
export function newStatement(
  answer: CanonicalAnswer,
  applicationId: Id,
  deps: Deps,
): Statement {
  const statement: Statement = {
    id: deps.newId(),
    createdAt: deps.now(),
    applicationId,
  };
  if (answer.key !== undefined) statement.answerKey = answer.key;
  if (isPlainObject(answer.value)) {
    statement.value = { ...answer.value };
  }
  return statement;
}

/** Saves the told value and clears any exception mark. */
export function putStatementOps(
  statement: Statement,
  value: AnswerValue | undefined,
): WriteOp[] {
  const record: Statement = { ...statement };
  delete record.exception;
  if (value === undefined) delete record.value;
  else record.value = value;
  return [{ kind: 'put', store: 'statements', record }];
}

export function deleteStatementOps(statementId: Id): WriteOp[] {
  return [{ kind: 'delete', store: 'statements', id: statementId }];
}

/** Makes the canonical answer match what was told. Never writes statements. */
export function resolveByUpdatingCanonical(
  statement: Statement,
  answer: CanonicalAnswer,
  deps: Deps,
): WriteOp[] {
  if (!isPlainObject(statement.value)) return [];
  const revised = reviseAnswer(answer, statement.value, deps);
  if (revised === answer) return [];
  return [{ kind: 'put', store: 'canonicalAnswers', record: revised }];
}

export function resolveAsException(statement: Statement): WriteOp[] {
  return [
    {
      kind: 'put',
      store: 'statements',
      record: { ...statement, exception: true },
    },
  ];
}
