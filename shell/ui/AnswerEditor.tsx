import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import {
  answerProblem,
  formatAnswer,
  reviseAnswer,
} from '../../core/src/answers';
import type { AnswerValue, CanonicalAnswer } from '../../core/src/types';
import { useAppData } from './app-data';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Kind = 'yes_no' | 'choice' | 'money_range' | 'date' | 'text';

// Restored records are not field-checked: unknown types fall back to text, and
// a choice without choices falls back to a text input that stores a choice.
function kindOf(answer: CanonicalAnswer): Kind {
  switch (answer.type) {
    case 'yes_no':
    case 'money_range':
    case 'date':
      return answer.type;
    case 'choice':
      return 'choice';
    default:
      return 'text';
  }
}

function choicesOf(answer: CanonicalAnswer): string[] {
  return Array.isArray(answer.choices)
    ? answer.choices.filter((c): c is string => typeof c === 'string')
    : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numStr(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '';
}

function toNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

export function AnswerEditor(props: { answer: CanonicalAnswer }): VNode {
  const { answer } = props;
  const appData = useAppData();
  const kind = kindOf(answer);
  const choices = choicesOf(answer);
  const stored: unknown = answer.value;
  const rec: Record<string, unknown> =
    typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};

  const [yesNo, setYesNo] = useState<'yes' | 'no' | ''>(
    rec.type === 'yes_no' && typeof rec.value === 'boolean'
      ? rec.value
        ? 'yes'
        : 'no'
      : '',
  );
  const [text, setText] = useState(str(rec.value));
  const [min, setMin] = useState(numStr(rec.min));
  const [max, setMax] = useState(numStr(rec.max));
  const [currency, setCurrency] = useState(str(rec.currency));
  const [period, setPeriod] = useState<'year' | 'hour'>(
    rec.period === 'hour' ? 'hour' : 'year',
  );
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const label = answer.label ?? answer.key ?? answer.id;

  // Returns the typed value, undefined for "no value", or a problem message.
  const build = ():
    { value: AnswerValue | undefined } | { problem: string } => {
    switch (kind) {
      case 'yes_no':
        return {
          value:
            yesNo === ''
              ? undefined
              : { type: 'yes_no', value: yesNo === 'yes' },
        };
      case 'money_range': {
        const lo = toNumber(min);
        const hi = toNumber(max);
        if (Number.isNaN(lo) || Number.isNaN(hi)) {
          return { problem: 'Enter amounts as numbers.' };
        }
        const cur = currency.trim();
        if (lo === undefined && hi === undefined && cur === '') {
          return { value: undefined };
        }
        const value: AnswerValue = { type: 'money_range', period };
        if (lo !== undefined) value.min = lo;
        if (hi !== undefined) value.max = hi;
        if (cur !== '') value.currency = cur;
        return { value };
      }
      case 'date':
        return {
          value: text === '' ? undefined : { type: 'date', value: text },
        };
      case 'choice':
        return {
          value: text === '' ? undefined : { type: 'choice', value: text },
        };
      case 'text':
        return {
          value: text.trim() === '' ? undefined : { type: 'text', value: text },
        };
    }
  };

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setSaved(false);
    const built = build();
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

  const edited = (): void => {
    setSaved(false);
    setProblem(undefined);
  };

  let input: VNode;
  switch (kind) {
    case 'yes_no':
      input = (
        <span class="answer-choices">
          <label>
            <input
              type="radio"
              name={`yn-${answer.id}`}
              checked={yesNo === 'yes'}
              onChange={() => {
                setYesNo('yes');
                edited();
              }}
            />{' '}
            Yes
          </label>
          <label>
            <input
              type="radio"
              name={`yn-${answer.id}`}
              checked={yesNo === 'no'}
              onChange={() => {
                setYesNo('no');
                edited();
              }}
            />{' '}
            No
          </label>
        </span>
      );
      break;
    case 'choice':
      input =
        choices.length > 0 ? (
          <select
            aria-label={label}
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              edited();
            }}
          >
            <option value="">(no answer)</option>
            {text !== '' && !choices.includes(text) ? (
              <option value={text}>{text}</option>
            ) : null}
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            aria-label={label}
            value={text}
            onInput={(e) => {
              setText(e.currentTarget.value);
              edited();
            }}
          />
        );
      break;
    case 'money_range':
      input = (
        <span class="answer-money">
          <label>
            Minimum{' '}
            <input
              type="text"
              inputMode="decimal"
              value={min}
              onInput={(e) => {
                setMin(e.currentTarget.value);
                edited();
              }}
            />
          </label>
          <label>
            Maximum{' '}
            <input
              type="text"
              inputMode="decimal"
              value={max}
              onInput={(e) => {
                setMax(e.currentTarget.value);
                edited();
              }}
            />
          </label>
          <label>
            Currency{' '}
            <input
              type="text"
              value={currency}
              onInput={(e) => {
                setCurrency(e.currentTarget.value);
                edited();
              }}
            />
          </label>
          <label>
            Period{' '}
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.currentTarget.value === 'hour' ? 'hour' : 'year');
                edited();
              }}
            >
              <option value="year">per year</option>
              <option value="hour">per hour</option>
            </select>
          </label>
        </span>
      );
      break;
    case 'date':
      input = (
        <input
          type="date"
          aria-label={label}
          value={text}
          onInput={(e) => {
            setText(e.currentTarget.value);
            edited();
          }}
        />
      );
      break;
    case 'text':
      input = (
        <textarea
          aria-label={label}
          value={text}
          onInput={(e) => {
            setText(e.currentTarget.value);
            edited();
          }}
        />
      );
      break;
  }

  const revisions = Array.isArray(answer.history)
    ? [...answer.history].reverse()
    : [];

  return (
    <section class="answer">
      <h2>{label}</h2>
      <form
        class="answer-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        {input}
        <button type="submit" disabled={busy}>
          Save
        </button>
        {problem ? (
          <span class="field-error" role="alert">
            {problem}
          </span>
        ) : null}
        {saved && !problem ? <span class="answer-saved">Saved</span> : null}
      </form>
      <details>
        <summary>History ({revisions.length})</summary>
        {revisions.length === 0 ? (
          <p>No earlier answers.</p>
        ) : (
          <ul class="history">
            {revisions.map((r, i) => (
              <li key={i}>
                <span>{formatAnswer(r?.value) || '(empty)'}</span>
                <span class="document-meta">
                  replaced{' '}
                  {str(r?.replacedAt).slice(0, 10) || 'on an unknown date'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
