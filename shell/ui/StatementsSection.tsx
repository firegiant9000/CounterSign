import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { answerProblem, formatAnswer } from '../../core/src/answers';
import { checkStatement } from '../../core/src/mismatch';
import {
  deleteStatementOps,
  newStatement,
  putStatementOps,
  resolveAsException,
  resolveByUpdatingCanonical,
  statementsFor,
} from '../../core/src/statements';
import type {
  AnswerValue,
  CanonicalAnswer,
  Id,
  Statement,
} from '../../core/src/types';
import { useAppData } from './app-data';
import { choicesOf, kindOf, useAnswerDraft } from './AnswerValueInput';
import type { AnswerKind } from './AnswerValueInput';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function storedType(value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).type
    : undefined;
}

function answerFor(
  answers: CanonicalAnswer[],
  statement: Statement,
): CanonicalAnswer | undefined {
  return answers.find(
    (a) => a.key !== undefined && a.key === statement.answerKey,
  );
}

// Mounted only while open, so it always starts from the current value.
function StatementEditor(props: {
  kind: AnswerKind;
  choices: string[];
  initial: unknown;
  name: string;
  label: string;
  busy: boolean;
  onSave: (value: AnswerValue | undefined) => void;
  onCancel: () => void;
}): VNode {
  const { kind, choices, initial, name, label, busy, onSave, onCancel } = props;
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const draft = useAnswerDraft({
    kind,
    choices,
    initial,
    name,
    label,
    onEdit: () => setProblem(undefined),
  });

  const submit = (event: Event): void => {
    event.preventDefault();
    if (busy) return;
    const built = draft.build();
    const found =
      'problem' in built ? built.problem : answerProblem(built.value);
    if (found !== undefined || !('value' in built)) {
      setProblem(found);
      return;
    }
    setProblem(undefined);
    onSave(built.value);
  };

  return (
    <form class="answer-form" onSubmit={submit}>
      {draft.input}
      <button type="submit" disabled={busy}>
        Save
      </button>
      <button type="button" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
      {problem ? (
        <span class="field-error" role="alert">
          {problem}
        </span>
      ) : null}
    </form>
  );
}

export function StatementsSection(props: { applicationId: Id }): VNode {
  const { applicationId } = props;
  const appData = useAppData();
  const { data, deps } = appData;
  const [editingId, setEditingId] = useState<Id | undefined>(undefined);
  const [adding, setAdding] = useState<
    { draft: Statement; answer: CanonicalAnswer } | undefined
  >(undefined);
  const [pickId, setPickId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const statements = statementsFor(data, applicationId);
  const answers = data.canonicalAnswers;

  const setError = (key: string, message: string | undefined): void => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message === undefined) delete next[key];
      else next[key] = message;
      return next;
    });
  };

  // Runs one write; returns true when it succeeded.
  const run = async (
    key: string,
    failure: string,
    write: () => Promise<void>,
  ): Promise<boolean> => {
    if (busy) return false;
    setError(key, undefined);
    setBusy(true);
    try {
      await write();
      return true;
    } catch (err) {
      setError(key, `${failure}: ${messageOf(err)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdit = async (
    statement: Statement,
    value: AnswerValue | undefined,
  ): Promise<void> => {
    const ok = await run(statement.id, 'Could not save', () =>
      appData.apply((d) => {
        const fresh = d.statements.find((s) => s.id === statement.id);
        return fresh ? putStatementOps(fresh, value) : [];
      }),
    );
    if (ok) setEditingId(undefined);
  };

  const onSaveNew = async (
    draft: Statement,
    value: AnswerValue | undefined,
  ): Promise<void> => {
    const ok = await run(draft.id, 'Could not save', () =>
      appData.apply((d) =>
        d.applications.some((a) => a.id === applicationId)
          ? putStatementOps(draft, value)
          : [],
      ),
    );
    if (ok) setAdding(undefined);
  };

  const onDelete = async (statement: Statement): Promise<void> => {
    if (busy) return;
    if (!confirm('Delete this entry?')) return;
    await run(statement.id, 'Could not delete', () =>
      appData.apply((d) =>
        d.statements.some((s) => s.id === statement.id)
          ? deleteStatementOps(statement.id)
          : [],
      ),
    );
  };

  const onUpdateCanonical = async (statement: Statement): Promise<void> => {
    await run(statement.id, 'Could not update your answer', () =>
      appData.apply((d) => {
        const fresh = d.statements.find((s) => s.id === statement.id);
        if (!fresh) return [];
        const answer = answerFor(d.canonicalAnswers, fresh);
        return answer ? resolveByUpdatingCanonical(fresh, answer, deps) : [];
      }),
    );
  };

  const onKeepException = async (statement: Statement): Promise<void> => {
    await run(statement.id, 'Could not keep as an exception', () =>
      appData.apply((d) => {
        const fresh = d.statements.find((s) => s.id === statement.id);
        return fresh ? resolveAsException(fresh) : [];
      }),
    );
  };

  const onStartAdd = (): void => {
    const answer = answers.find((a) => a.id === pickId) ?? answers[0];
    if (!answer) return;
    setError('add', undefined);
    setEditingId(undefined);
    setAdding({ draft: newStatement(answer, applicationId, deps), answer });
  };

  return (
    <div class="statements">
      {statements.length === 0 ? <p>Nothing recorded yet.</p> : null}
      <ul class="history">
        {statements.map((s) => {
          const answer = answerFor(answers, s);
          const label = answer?.label ?? answer?.key ?? s.answerKey;
          const told = formatAnswer(s.value);
          const check = checkStatement(s, answer);
          const canonical = answer ? formatAnswer(answer.value) : '';
          const editing = editingId === s.id;
          return (
            <li key={s.id}>
              <div>
                <div>
                  <strong>{label ?? 'Unknown answer'}</strong>:{' '}
                  {told === '' ? '(empty)' : told}
                </div>
                {check === 'mismatch' ? (
                  <div class="warning" role="status">
                    Differs from your answer: {canonical}{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void onUpdateCanonical(s);
                      }}
                    >
                      Update canonical
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void onKeepException(s);
                      }}
                    >
                      Keep as exception
                    </button>
                  </div>
                ) : null}
                {check === 'compare' ? (
                  <div class="document-meta">
                    Your answer: {canonical === '' ? 'none' : canonical}
                  </div>
                ) : null}
                {check === 'exception' ? (
                  <div class="document-meta">Kept as an exception</div>
                ) : null}
                {editing ? (
                  <StatementEditor
                    key={s.id}
                    kind={kindOf(answer ? answer.type : storedType(s.value))}
                    choices={choicesOf(answer?.choices)}
                    initial={s.value}
                    name={'st-' + s.id}
                    label={label ?? 'Answer'}
                    busy={busy}
                    onSave={(value) => {
                      void onSaveEdit(s, value);
                    }}
                    onCancel={() => setEditingId(undefined)}
                  />
                ) : null}
                {errors[s.id] ? (
                  <span class="field-error" role="alert">
                    {errors[s.id]}
                  </span>
                ) : null}
              </div>
              {editing ? null : (
                <span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAdding(undefined);
                      setError(s.id, undefined);
                      setEditingId(s.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void onDelete(s);
                    }}
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div>
          <strong>
            {adding.answer.label ?? adding.answer.key ?? 'Unknown answer'}
          </strong>
          <StatementEditor
            key={adding.draft.id}
            kind={kindOf(adding.answer.type)}
            choices={choicesOf(adding.answer.choices)}
            initial={adding.draft.value}
            name={'st-' + adding.draft.id}
            label={adding.answer.label ?? adding.answer.key ?? 'Answer'}
            busy={busy}
            onSave={(value) => {
              void onSaveNew(adding.draft, value);
            }}
            onCancel={() => setAdding(undefined)}
          />
          {errors[adding.draft.id] ? (
            <span class="field-error" role="alert">
              {errors[adding.draft.id]}
            </span>
          ) : null}
        </div>
      ) : answers.length > 0 ? (
        <p>
          <select
            aria-label="Answer to add"
            value={pickId === '' ? (answers[0]?.id ?? '') : pickId}
            onChange={(e) => setPickId(e.currentTarget.value)}
          >
            {answers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label ?? a.key ?? 'Unknown answer'}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={onStartAdd}>
            Add
          </button>
        </p>
      ) : null}
    </div>
  );
}
