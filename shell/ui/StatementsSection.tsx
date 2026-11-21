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
import { Button } from './components/Button';
import { Fact } from './components/Fact';
import { Field } from './components/Field';
import { LedgerSheet, ledgerRowClass } from './components/LedgerSheet';
import { TypedLine } from './components/TypedLine';
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
      <Button variant="primary" type="submit" disabled={busy}>
        Save
      </Button>
      <Button disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
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
  // Only answers with a usable key can be added; the key links the entry.
  const addable = answers.filter(
    (a) => typeof a.key === 'string' && a.key !== '',
  );

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
    const seen = { gone: false };
    const ok = await run(draft.id, 'Could not save', () =>
      appData.apply((d) => {
        if (!d.applications.some((a) => a.id === applicationId)) {
          seen.gone = true;
          return [];
        }
        return putStatementOps(draft, value);
      }),
    );
    if (!ok) return;
    if (seen.gone) setError(draft.id, 'This application no longer exists.');
    else setAdding(undefined);
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
    const answer = addable.find((a) => a.id === pickId) ?? addable[0];
    if (!answer) return;
    setError('add', undefined);
    setEditingId(undefined);
    setAdding({ draft: newStatement(answer, applicationId, deps), answer });
  };

  return (
    <div class="statements">
      <LedgerSheet>
        {statements.length === 0 ? (
          <TypedLine tone="muted">Nothing recorded yet.</TypedLine>
        ) : null}
        <ul class="history">
          {statements.map((s) => {
            const answer = answerFor(answers, s);
            const label = answer?.label ?? answer?.key ?? s.answerKey;
            const told = formatAnswer(s.value);
            const check = checkStatement(s, answer);
            const canonical = answer ? formatAnswer(answer.value) : '';
            const editing = editingId === s.id;
            return (
              <li
                key={s.id}
                class={ledgerRowClass(check === 'mismatch' ? 'maroon' : 'none')}
              >
                <div>
                  <div>
                    <strong>{label ?? 'Unknown answer'}</strong>:{' '}
                    {told === '' ? '(empty)' : told}
                  </div>
                  {typeof s.question === 'string' &&
                  s.question.trim() !== '' ? (
                    <div class="document-meta">They asked: {s.question}</div>
                  ) : null}
                  {s.source === 'fill' ? (
                    <Fact tone="neutral">From a fill</Fact>
                  ) : null}
                  {check === 'mismatch' ? (
                    <Fact tone="warning" role="status">
                      Differs from your answer: {canonical}{' '}
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => {
                          void onUpdateCanonical(s);
                        }}
                      >
                        Update canonical
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void onKeepException(s);
                        }}
                      >
                        Keep as exception
                      </Button>
                    </Fact>
                  ) : null}
                  {check === 'compare' ? (
                    <div class="document-meta">
                      Your answer: {canonical === '' ? 'none' : canonical}
                    </div>
                  ) : null}
                  {check === 'exception' ? (
                    <TypedLine tone="muted">Kept as an exception</TypedLine>
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
                      onCancel={() => {
                        setError(s.id, undefined);
                        setEditingId(undefined);
                      }}
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
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setAdding(undefined);
                        setError(s.id, undefined);
                        setEditingId(s.id);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        void onDelete(s);
                      }}
                    >
                      Delete
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </LedgerSheet>

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
      ) : addable.length > 0 ? (
        <p>
          <Field label={null}>
            <select
              aria-label="Answer to add"
              value={
                addable.some((a) => a.id === pickId)
                  ? pickId
                  : (addable[0]?.id ?? '')
              }
              onChange={(e) => setPickId(e.currentTarget.value)}
            >
              {addable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label ?? a.key ?? 'Unknown answer'}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="primary" disabled={busy} onClick={onStartAdd}>
            Add
          </Button>
        </p>
      ) : null}
    </div>
  );
}
