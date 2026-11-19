import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import type { AnswerValue } from '../../core/src/types';
import { Field } from './components/Field';

export type AnswerKind = 'yes_no' | 'choice' | 'money_range' | 'date' | 'text';

export type DraftResult =
  { value: AnswerValue | undefined } | { problem: string };

// Restored records are not field-checked: unknown types fall back to text, and
// a choice without choices falls back to a text input that stores a choice.
export function kindOf(type: unknown): AnswerKind {
  switch (type) {
    case 'yes_no':
      return 'yes_no';
    case 'money_range':
      return 'money_range';
    case 'date':
      return 'date';
    case 'choice':
      return 'choice';
    default:
      return 'text';
  }
}

export function choicesOf(choices: unknown): string[] {
  return Array.isArray(choices)
    ? choices.filter((c): c is string => typeof c === 'string')
    : [];
}

export function str(value: unknown): string {
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

export function useAnswerDraft(opts: {
  kind: AnswerKind;
  choices: string[];
  initial: unknown; // the stored AnswerValue, unchecked
  name: string; // unique per editor, for radio groups
  label: string; // aria-label
  onEdit?: () => void;
}): { input: VNode; build(): DraftResult } {
  const { kind, choices, initial, name, label, onEdit } = opts;
  const rec: Record<string, unknown> =
    typeof initial === 'object' && initial !== null && !Array.isArray(initial)
      ? (initial as Record<string, unknown>)
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

  const edited = (): void => {
    onEdit?.();
  };

  // Returns the typed value, undefined for "no value", or a problem message.
  const build = (): DraftResult => {
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

  let input: VNode;
  switch (kind) {
    case 'yes_no':
      input = (
        <span class="answer-choices">
          <label>
            <input
              type="radio"
              name={name}
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
              name={name}
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
          <Field label={null}>
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
          </Field>
        ) : (
          <Field label={null}>
            <input
              type="text"
              aria-label={label}
              value={text}
              onInput={(e) => {
                setText(e.currentTarget.value);
                edited();
              }}
            />
          </Field>
        );
      break;
    case 'money_range':
      input = (
        <span class="answer-money">
          <Field label="Minimum">
            <input
              type="text"
              inputMode="decimal"
              value={min}
              onInput={(e) => {
                setMin(e.currentTarget.value);
                edited();
              }}
            />
          </Field>
          <Field label="Maximum">
            <input
              type="text"
              inputMode="decimal"
              value={max}
              onInput={(e) => {
                setMax(e.currentTarget.value);
                edited();
              }}
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              value={currency}
              onInput={(e) => {
                setCurrency(e.currentTarget.value);
                edited();
              }}
            />
          </Field>
          <Field label="Period">
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
          </Field>
        </span>
      );
      break;
    case 'date':
      input = (
        <Field label={null}>
          <input
            type="date"
            aria-label={label}
            value={text}
            onInput={(e) => {
              setText(e.currentTarget.value);
              edited();
            }}
          />
        </Field>
      );
      break;
    case 'text':
      input = (
        <Field label={null}>
          <textarea
            aria-label={label}
            value={text}
            onInput={(e) => {
              setText(e.currentTarget.value);
              edited();
            }}
          />
        </Field>
      );
      break;
  }

  return { input, build };
}
