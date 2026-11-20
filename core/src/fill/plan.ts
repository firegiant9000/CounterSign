import { DEFAULT_ANSWERS, formatAnswer } from '../answers';
import { isLocalDate } from '../dates';
import type { ProfileKey } from '../profile';
import type { AnswerType, AnswerValue } from '../types';
import { sameProfileValue, sameText } from './compare';
import { countryOf, placesNamed } from './countries';
import { fitField, type FitResult, type OwnKind } from './fit';
import { hasNegation, normalizeLabel } from './normalize';
import { recogniseAnswers, recogniseProfile } from './recognise';
import { frameAdvice } from './site';
import { DEFAULT_TABLES, type RecognitionTables } from './tables';
import type {
  FillPlan,
  FillTarget,
  FormScan,
  NotFilledReason,
  PlanInput,
  PlanRow,
  ScannedField,
} from './types';

/** What a field means, found once per field. */
type Recognised =
  | { kind: 'profile'; key: ProfileKey }
  | { kind: 'answer'; key: string }
  | { kind: 'two_answers'; keys: string[] }
  | { kind: 'nothing' };

/** A saved answer that is safe to offer: its display text and a clean copy of the value. */
interface OwnAnswer {
  value: AnswerValue;
  text: string;
}

const ANSWER_TYPES = new Map<string, AnswerType>(
  DEFAULT_ANSWERS.map((a) => [a.key, a.type]),
);

// ---- Rule 2: recognise a field ------------------------------------------

function recognise(field: ScannedField, tables: RecognitionTables): Recognised {
  const profileKey = recogniseProfile(field, tables);
  if (profileKey !== undefined) return { kind: 'profile', key: profileKey };
  const keys = recogniseAnswers(field, tables);
  const [first] = keys;
  if (first === undefined) return { kind: 'nothing' };
  return keys.length === 1
    ? { kind: 'answer', key: first }
    : { kind: 'two_answers', keys };
}

// ---- Rule 5: first pass, count the keys ---------------------------------

function duplicateKeys(recognised: readonly Recognised[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of recognised) {
    const id = countKey(r);
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const duplicated = new Set<string>();
  for (const [id, count] of counts) if (count >= 2) duplicated.add(id);
  return duplicated;
}

function countKey(r: Recognised): string | undefined {
  if (r.kind === 'profile') return `profile:${r.key}`;
  if (r.kind === 'answer') return `answer:${r.key}`;
  return undefined;
}

// ---- Rule 8: the owner's value ------------------------------------------

function profileValue(input: PlanInput, key: ProfileKey): string {
  const raw: unknown = input.profile[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function nonEmptyString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Checks the stored value against the type the key must have; rebuilds a clean copy. */
function cleanAnswer(raw: unknown, type: AnswerType): OwnAnswer | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const stored = raw as { type?: unknown; value?: unknown };
  if (stored.type !== type) return undefined;
  switch (type) {
    case 'yes_no': {
      if (typeof stored.value !== 'boolean') return undefined;
      return {
        value: { type: 'yes_no', value: stored.value },
        text: stored.value ? 'Yes' : 'No',
      };
    }
    case 'choice':
    case 'text': {
      const text = nonEmptyString(stored.value);
      if (text === undefined) return undefined;
      return { value: { type, value: text }, text };
    }
    case 'date': {
      const day = stored.value;
      if (typeof day !== 'string' || !isLocalDate(day)) return undefined;
      return { value: { type: 'date', value: day }, text: day };
    }
    case 'money_range': {
      const text = formatAnswer(raw as AnswerValue);
      return text === '' ? undefined : { value: raw as AnswerValue, text };
    }
    default:
      return undefined;
  }
}

function ownAnswer(input: PlanInput, key: string): OwnAnswer | undefined {
  const type = ANSWER_TYPES.get(key);
  if (type === undefined) return undefined;
  const record: unknown = input.answers.find(
    (a: unknown) =>
      typeof a === 'object' &&
      a !== null &&
      (a as { key?: unknown }).key === key,
  );
  if (record === undefined) return undefined;
  return cleanAnswer((record as { value?: unknown }).value, type);
}

function answerKind(own: OwnAnswer): OwnKind | undefined {
  switch (own.value.type) {
    case 'yes_no':
    case 'choice':
    case 'date':
    case 'text':
      return own.value.type;
    default:
      return undefined;
  }
}

// ---- Rule 6: the place check --------------------------------------------

/** True when the question names a place that is not the owner's country. */
function namesOtherPlace(label: string, input: PlanInput): boolean {
  const named = placesNamed(normalizeLabel(label));
  if (named.length === 0) return false;
  const country =
    typeof input.profile.country === 'string'
      ? countryOf(input.profile.country)
      : undefined;
  return country === undefined || !named.every((place) => place === country);
}

// ---- Rows ---------------------------------------------------------------

/** What the form holds now, as text. */
function formValueOf(field: ScannedField): string {
  switch (field.control) {
    case 'text':
    case 'textarea':
    case 'date':
    case 'select':
      return field.value;
    case 'choice_group':
      return field.checked
        .map((i) => field.options[i])
        .filter((o): o is string => o !== undefined)
        .join(', ');
    default:
      return '';
  }
}

function baseRow(field: ScannedField, target?: FillTarget): PlanRow {
  const row: PlanRow = {
    ref: field.ref,
    label: field.label,
    control: field.control,
    required: field.required,
    status: 'not_filled',
    formValue: formValueOf(field),
    ownValue: '',
  };
  if (target !== undefined) row.target = target;
  return row;
}

function notFilled(
  field: ScannedField,
  reason: NotFilledReason,
  target?: FillTarget,
  own?: OwnAnswer | string,
): PlanRow {
  const row = baseRow(field, target);
  row.reason = reason;
  if (own !== undefined) setOwn(row, own);
  return row;
}

/** Sets ownValue, and answerValue only for an answer target with a value (never for a profile one). */
function setOwn(row: PlanRow, own: OwnAnswer | string): void {
  if (typeof own === 'string') {
    row.ownValue = own;
    return;
  }
  row.ownValue = own.text;
  if (row.target?.kind === 'answer') row.answerValue = own.value;
}

/** Rule 9: the row for a fit result. */
function fitRow(
  field: ScannedField,
  target: FillTarget,
  fit: FitResult,
  own: OwnAnswer | string,
  same: (formValue: string, ownText: string) => boolean,
): PlanRow {
  const ownText = typeof own === 'string' ? own : own.text;
  if (fit.fit === 'none') return notFilled(field, fit.reason, target, own);
  const row = baseRow(field, target);
  setOwn(row, own);
  if (fit.fit === 'holds') {
    row.formValue = fit.formValue;
    row.status = same(fit.formValue, ownText) ? 'matches' : 'differs';
    return row;
  }
  row.status = 'will_fill';
  row.write = fit.write;
  return row;
}

function profileRow(
  field: ScannedField,
  key: ProfileKey,
  duplicated: boolean,
  input: PlanInput,
): PlanRow {
  const target: FillTarget = { kind: 'profile', key };
  const own = profileValue(input, key);
  // 5. Duplicates keep the owner's value for the copy button.
  if (duplicated) return notFilled(field, 'ambiguous', target, own);
  // 7. Custom control.
  if (field.control === 'custom') {
    return notFilled(field, 'custom_control', target, own);
  }
  // 8. No value.
  if (own === '') return notFilled(field, 'no_value', target);
  // 9. Fit.
  const kind: OwnKind =
    key === 'country' || key === 'region' ? 'place' : 'text';
  return fitRow(field, target, fitField(field, kind, own), own, (form, mine) =>
    sameProfileValue(key, form, mine),
  );
}

function answerRow(
  field: ScannedField,
  key: string,
  duplicated: boolean,
  input: PlanInput,
): PlanRow {
  const target: FillTarget = { kind: 'answer', key };
  // 5. Duplicates offer nothing.
  if (duplicated) return notFilled(field, 'ambiguous', target);
  // 6. Answers only.
  if (hasNegation(field.label)) return notFilled(field, 'negated', target);
  const own = ownAnswer(input, key);
  if (key === 'salary_range') {
    return notFilled(field, 'never_auto', target, own);
  }
  if (
    (key === 'work_authorization' || key === 'sponsorship') &&
    namesOtherPlace(field.label, input)
  ) {
    return notFilled(field, 'other_country', target);
  }
  // 7. Custom control.
  if (field.control === 'custom') {
    return notFilled(field, 'custom_control', target, own);
  }
  // 8. No value.
  const kind = own === undefined ? undefined : answerKind(own);
  if (own === undefined || kind === undefined) {
    return notFilled(field, 'no_value', target);
  }
  // 9. Fit.
  return fitRow(field, target, fitField(field, kind, own.text), own, sameText);
}

/** Rules 1, 3 and 4, then the profile or answer rules. Undefined means no row. */
function planField(
  field: ScannedField,
  recognised: Recognised,
  duplicates: ReadonlySet<string>,
  input: PlanInput,
): PlanRow | undefined {
  // 1. Files.
  if (field.control === 'file') return notFilled(field, 'file');
  const duplicated = duplicates.has(countKey(recognised) ?? '');
  switch (recognised.kind) {
    case 'nothing':
      // 3. Optional unknown fields get no row; the caller counts them.
      return field.required ? notFilled(field, 'not_recognised') : undefined;
    case 'two_answers':
      // 4. One question, two answers.
      return notFilled(field, 'ambiguous', {
        kind: 'answer',
        key: recognised.keys[0] ?? '',
      });
    case 'profile':
      return profileRow(field, recognised.key, duplicated, input);
    case 'answer':
      return answerRow(field, recognised.key, duplicated, input);
  }
}

/**
 * Decides what the extension would write into a form. Pure: it reads the
 * scan, the owner's details and answers, and returns one row per recognised
 * field plus the writes. It never replaces a value and never writes when in doubt.
 */
export function buildPlan(
  scan: FormScan,
  input: PlanInput,
  tables: RecognitionTables = DEFAULT_TABLES,
): FillPlan {
  const recognised = scan.fields.map((f) =>
    f.control === 'file'
      ? ({ kind: 'nothing' } as const)
      : recognise(f, tables),
  );
  const duplicates = duplicateKeys(recognised);
  const plan: FillPlan = {
    rows: [],
    writes: [],
    unrecognisedOptional: 0,
    frames: frameAdvice(scan.frames),
  };
  scan.fields.forEach((field, i) => {
    const r = recognised[i] ?? ({ kind: 'nothing' } as const);
    const row = planField(field, r, duplicates, input);
    if (row === undefined) {
      plan.unrecognisedOptional += 1;
      return;
    }
    plan.rows.push(row);
    if (row.status === 'will_fill' && row.write !== undefined) {
      plan.writes.push(row.write);
    }
  });
  return plan;
}
