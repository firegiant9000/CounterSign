import { isLocalDate } from './dates';
import type { AnswerType, AnswerValue, CanonicalAnswer, Deps } from './types';

export const DEFAULT_ANSWERS: readonly {
  key: string;
  label: string;
  type: AnswerType;
  choices?: string[];
}[] = [
  { key: 'work_authorization', label: 'Authorized to work', type: 'yes_no' },
  { key: 'sponsorship', label: 'Needs sponsorship', type: 'yes_no' },
  { key: 'salary_range', label: 'Salary range', type: 'money_range' },
  { key: 'earliest_start_date', label: 'Earliest start date', type: 'date' },
  {
    key: 'relocation',
    label: 'Open to relocation',
    type: 'choice',
    choices: ['Yes', 'No', 'Depends on location'],
  },
  { key: 'reason_for_leaving', label: 'Reason for leaving', type: 'text' },
];

/** Fresh records for each default whose key is not already present. */
export function missingDefaultAnswers(
  existing: readonly CanonicalAnswer[],
  deps: Deps,
): CanonicalAnswer[] {
  const present = new Set(existing.map((a) => a.key));
  return DEFAULT_ANSWERS.filter((d) => !present.has(d.key)).map((d) => {
    const answer: CanonicalAnswer = {
      id: deps.newId(),
      createdAt: deps.now(),
      key: d.key,
      label: d.label,
      type: d.type,
    };
    if (d.type === 'choice') answer.choices = [...(d.choices ?? [])];
    return answer;
  });
}

/** Structural equality for plain JSON data; key order and undefined-vs-absent do not matter. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) {
    if (!sameData(ra[key], rb[key])) return false;
  }
  return true;
}

/**
 * Returns a revised copy of `answer` holding `value` (or no value when
 * `undefined`). The previous value, if any, is appended to `history`.
 * Returns `answer` itself when nothing changed. Never mutates the input.
 */
export function reviseAnswer(
  answer: CanonicalAnswer,
  value: AnswerValue | undefined,
  deps: Deps,
): CanonicalAnswer {
  if (sameData(answer.value, value)) return answer;
  const next: CanonicalAnswer = { ...answer };
  if (Array.isArray(answer.history)) next.history = [...answer.history];
  else delete next.history;
  if (answer.value !== undefined) {
    next.history = [
      ...(next.history ?? []),
      { value: answer.value, replacedAt: deps.now() },
    ];
  }
  if (value === undefined) {
    delete next.value;
  } else {
    next.value = value;
  }
  return next;
}

// Restored records are not field-checked, so a value may be null, a primitive or an array.
function isObject<T>(value: T | undefined): value is T {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A human-readable problem with `value`, or `undefined` when it is acceptable. */
export function answerProblem(
  value: AnswerValue | undefined,
): string | undefined {
  if (!isObject(value)) return undefined;
  if (value.type === 'money_range') {
    if (isNum(value.min) && isNum(value.max) && value.min > value.max) {
      return 'Minimum is above maximum.';
    }
    return undefined;
  }
  if (value.type === 'date' && !isLocalDate(value.value)) {
    return 'Enter a date as YYYY-MM-DD.';
  }
  return undefined;
}

function formatMoney(
  value: Extract<AnswerValue, { type: 'money_range' }>,
): string {
  const money = (n: number) => n.toLocaleString('en-US');
  let amount = '';
  const { min, max } = value;
  if (isNum(min) && isNum(max)) {
    amount = `${money(min)} to ${money(max)}`;
  } else if (isNum(min)) {
    amount = `from ${money(min)}`;
  } else if (isNum(max)) {
    amount = `up to ${money(max)}`;
  }
  if (amount === '') return '';
  const { currency, period } = value;
  if (typeof currency === 'string' && currency) amount += ` ${currency}`;
  if (typeof period === 'string' && period) amount += ` per ${period}`;
  return amount;
}

/** Display text for an answer value; empty when there is no value. */
export function formatAnswer(value: AnswerValue | undefined): string {
  if (!isObject(value)) return '';
  switch (value.type) {
    case 'yes_no':
      return typeof value.value === 'boolean'
        ? value.value
          ? 'Yes'
          : 'No'
        : '';
    case 'choice':
    case 'date':
    case 'text':
      return typeof value.value === 'string' ? value.value : '';
    case 'money_range':
      return formatMoney(value);
    default:
      return '';
  }
}
