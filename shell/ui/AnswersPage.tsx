import type { VNode } from 'preact';
import { DEFAULT_ANSWERS } from '../../core/src/answers';
import type { CanonicalAnswer } from '../../core/src/types';
import { AnswerEditor } from './AnswerEditor';
import { useAppData } from './app-data';

function rank(answer: CanonicalAnswer): number {
  const i = DEFAULT_ANSWERS.findIndex((d) => d.key === answer.key);
  return i === -1 ? DEFAULT_ANSWERS.length : i;
}

function sortName(answer: CanonicalAnswer): string {
  const name: unknown = answer.label ?? answer.key ?? answer.id;
  return typeof name === 'string' ? name : String(answer.id);
}

export function AnswersPage(): VNode {
  const { data } = useAppData();
  const answers = [...data.canonicalAnswers].sort(
    (a, b) => rank(a) - rank(b) || sortName(a).localeCompare(sortName(b)),
  );
  return (
    <div>
      <h1>Answers</h1>
      <p>
        Standard answers for application forms. Earlier answers are kept under
        History.
      </p>
      {answers.map((a) => (
        <AnswerEditor key={a.id} answer={a} />
      ))}
    </div>
  );
}
