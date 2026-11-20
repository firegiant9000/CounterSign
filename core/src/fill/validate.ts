import {
  CONTROL_KINDS,
  MAX_AUTOCOMPLETE,
  MAX_FIELDS,
  MAX_FRAME_SRC,
  MAX_FRAMES,
  MAX_LABEL,
  MAX_OPTIONS,
  MAX_VALUE,
  WRITE_OUTCOMES,
  type ApplyResult,
  type ControlKind,
  type FormScan,
  type ScannedField,
  type WriteOutcome,
  type WriteReport,
} from './types';

// Everything here arrives from a script that ran inside a web page. It is
// capped or dropped, never thrown on.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function controlOf(value: unknown): ControlKind | undefined {
  return CONTROL_KINDS.find((kind) => kind === value);
}

const VALUE_CONTROLS: readonly ControlKind[] = [
  'text',
  'textarea',
  'date',
  'select',
];
const OPTION_CONTROLS: readonly ControlKind[] = ['select', 'choice_group'];

// `cut` is true when the list is not trustworthy as a whole: it was cut at
// the cap, or a non-string entry was dropped (which shifts later indexes).
function toOptions(raw: unknown): { options: string[]; cut: boolean } {
  const options: string[] = [];
  if (!Array.isArray(raw)) return { options, cut: false };
  let dropped = false;
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'string') {
      dropped = true;
      continue;
    }
    if (options.length === MAX_OPTIONS) return { options, cut: true };
    options.push(text(entry, MAX_LABEL));
  }
  return { options, cut: dropped };
}

function toChecked(raw: unknown, optionCount: number): number[] {
  if (!Array.isArray(raw)) return [];
  const checked: number[] = [];
  for (const entry of raw as unknown[]) {
    if (
      typeof entry === 'number' &&
      Number.isInteger(entry) &&
      entry >= 0 &&
      entry < optionCount &&
      !checked.includes(entry)
    )
      checked.push(entry);
  }
  return checked;
}

function toField(raw: unknown): ScannedField | undefined {
  if (!isPlainObject(raw)) return undefined;
  const ref = raw.ref;
  if (typeof ref !== 'number' || !Number.isSafeInteger(ref) || ref < 0)
    return undefined;
  const control = controlOf(raw.control);
  if (control === undefined) return undefined;
  const usesOptions = OPTION_CONTROLS.includes(control);
  const { options, cut } = usesOptions
    ? toOptions(raw.options)
    : { options: [], cut: false };
  return {
    ref,
    control,
    label: text(raw.label, MAX_LABEL),
    autocomplete: text(raw.autocomplete, MAX_AUTOCOMPLETE).toLowerCase(),
    required: raw.required === true,
    value: VALUE_CONTROLS.includes(control) ? text(raw.value, MAX_VALUE) : '',
    options,
    checked:
      control === 'choice_group' ? toChecked(raw.checked, options.length) : [],
    multiple: usesOptions && raw.multiple === true,
    optionsTruncated: usesOptions && (cut || raw.optionsTruncated === true),
  };
}

function toFrames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const frames: string[] = [];
  for (const entry of raw as unknown[]) {
    if (frames.length === MAX_FRAMES) break;
    if (typeof entry === 'string' && entry.startsWith('https://'))
      frames.push(entry.slice(0, MAX_FRAME_SRC));
  }
  return frames;
}

export function toFormScan(raw: unknown): FormScan | undefined {
  if (!isPlainObject(raw) || !Array.isArray(raw.fields)) return undefined;
  const fields: ScannedField[] = [];
  const seen = new Set<number>();
  let cut = false;
  for (const entry of raw.fields as unknown[]) {
    const field = toField(entry);
    if (field === undefined || seen.has(field.ref)) continue;
    if (fields.length === MAX_FIELDS) {
      cut = true;
      break;
    }
    seen.add(field.ref);
    fields.push(field);
  }
  return {
    fields,
    frames: toFrames(raw.frames),
    truncated: cut || raw.truncated === true,
  };
}

function outcomeOf(value: unknown): WriteOutcome {
  return WRITE_OUTCOMES.find((outcome) => outcome === value) ?? 'failed';
}

export function toApplyResult(raw: unknown): ApplyResult | undefined {
  if (!isPlainObject(raw) || !Array.isArray(raw.outcomes)) return undefined;
  const scan = toFormScan(raw.scan);
  if (scan === undefined) return undefined;
  const outcomes: WriteReport[] = [];
  for (const entry of raw.outcomes as unknown[]) {
    if (outcomes.length === MAX_FIELDS) break;
    if (
      !isPlainObject(entry) ||
      typeof entry.ref !== 'number' ||
      !Number.isSafeInteger(entry.ref) ||
      entry.ref < 0
    )
      continue;
    outcomes.push({ ref: entry.ref, outcome: outcomeOf(entry.outcome) });
  }
  return { outcomes, scan };
}
