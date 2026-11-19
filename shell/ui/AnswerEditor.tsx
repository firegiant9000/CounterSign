import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import {
  answerProblem,
  formatAnswer,
  reviseAnswer,
} from '../../core/src/answers';
import type { CanonicalAnswer } from '../../core/src/types';
import { useAppData } from './app-data';
import { Button } from './components/Button';
import { Disclosure } from './components/Disclosure';
import { IndexCard } from './components/IndexCard';
import { Text } from './components/Text';
import { TypedLine } from './components/TypedLine';
import { choicesOf, kindOf, str, useAnswerDraft } from './AnswerValueInput';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function AnswerEditor(props: { answer: CanonicalAnswer }): VNode {
  const { answer } = props;
  const appData = useAppData();
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const label = answer.label ?? answer.key ?? answer.id;

  const edited = (): void => {
    setSaved(false);
    setProblem(undefined);
  };

  const draft = useAnswerDraft({
    kind: kindOf(answer.type),
    choices: choicesOf(answer.choices),
    initial: answer.value,
    name: 'yn-' + answer.id,
    label,
    onEdit: edited,
  });

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setSaved(false);
    const built = draft.build();
    const found =
      'problem' in built ? built.problem : answerProblem(built.value);
    if (found !== undefined || !('value' in built)) {
      setProblem(found);
      return;
    }
    setProblem(undefined);
    const { value } = built;
    setBusy(true);
    try {
      await appData.apply((d) => {
        const fresh = d.canonicalAnswers.find((x) => x.id === answer.id);
        if (!fresh) return [];
        const next = reviseAnswer(fresh, value, appData.deps);
        return next === fresh
          ? []
          : [{ kind: 'put', store: 'canonicalAnswers', record: next }];
      });
      setSaved(true);
    } catch (err) {
      setProblem(`Could not save: ${messageOf(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const revisions = Array.isArray(answer.history)
    ? [...answer.history].reverse()
    : [];

  return (
    <IndexCard title={label}>
      <form
        class="answer-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        {draft.input}
        <Button variant="primary" type="submit" disabled={busy}>
          Save
        </Button>
        {problem ? (
          <span class="field-error" role="alert">
            {problem}
          </span>
        ) : null}
        {saved && !problem ? (
          <TypedLine as="span" tone="muted">
            Saved
          </TypedLine>
        ) : null}
      </form>
      <Disclosure summary={`History (${revisions.length})`}>
        {revisions.length === 0 ? (
          <TypedLine>No earlier answers.</TypedLine>
        ) : (
          <ul class="history">
            {revisions.map((r, i) => (
              <li key={i}>
                <Text kind="body">{formatAnswer(r?.value) || '(empty)'}</Text>
                <TypedLine as="span" tone="muted">
                  replaced{' '}
                  {str(r?.replacedAt).slice(0, 10) || 'on an unknown date'}
                </TypedLine>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </IndexCard>
  );
}
