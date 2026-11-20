import { PROFILE_FIELDS } from '../../core/src/profile';
import type { NotFilledReason, PlanRow } from '../../core/src/fill/types';
import type { FillState } from '../fill/controller';

export interface FillViewRow {
  key: string;
  label: string;
  lines: string[];
  copy?: string;
}

export interface FillView {
  button?: string;
  nothing?: string;
  filledLine?: string;
  error?: string;
  frames: string[];
  willFill: FillViewRow[];
  matches: FillViewRow[];
  differs: FillViewRow[];
  notFilled: FillViewRow[];
  optionalLine?: string;
  footer: string;
}

const PROFILE_LABELS = new Map<string, string>(
  PROFILE_FIELDS.map((f) => [f.key, f.label]),
);

const NO_COPY_REASONS: ReadonlySet<NotFilledReason> = new Set([
  'no_value',
  'file',
  'not_recognised',
  'changed',
]);

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function reasonLine(row: PlanRow): string {
  switch (row.reason) {
    case 'no_value':
      if (row.target?.kind === 'profile') {
        const label = PROFILE_LABELS.get(row.target.key);
        return label === undefined
          ? 'add it in My details'
          : `add ${label} in My details`;
      }
      return 'add it on the Answers page';
    case 'custom_control':
      return 'custom dropdown, choose it yourself';
    case 'unsupported_control':
      return 'this kind of field is not filled';
    case 'never_auto':
      return 'never auto-filled';
    case 'ambiguous':
      return 'more than one match, not filled';
    case 'negated':
      return 'worded as a negative, answer it yourself';
    case 'other_country':
      return 'names another place, answer it yourself';
    case 'file':
      return 'attach it yourself';
    case 'not_recognised':
      return 'required, not recognised';
    case 'changed':
      return 'changed while filling';
    default:
      return 'not filled';
  }
}

function frameSentence(site: 'greenhouse' | 'ashby'): string {
  const name = site === 'greenhouse' ? 'a Greenhouse' : 'an Ashby';
  return `This form is inside ${name} frame, which Countersign cannot reach from here. Right-click the form, choose This Frame, then Open Frame in New Tab, and open Countersign there.`;
}

function viewRow(row: PlanRow, key: string, lines: string[]): FillViewRow {
  const out: FillViewRow = {
    key,
    label: row.label === '' ? '(no label)' : row.label,
    lines,
  };
  const copyable =
    row.status === 'differs' ||
    (row.status === 'not_filled' &&
      row.reason !== undefined &&
      !NO_COPY_REASONS.has(row.reason));
  if (copyable && row.ownValue !== '') out.copy = row.ownValue;
  return out;
}

function willFillLine(row: PlanRow): string {
  return row.write?.kind === 'value' ? row.write.value : row.ownValue;
}

export function fillView(
  state: Extract<FillState, { status: 'ready' }>,
): FillView {
  const { plan } = state;
  const view: FillView = {
    frames: [],
    willFill: [],
    matches: [],
    differs: [],
    notFilled: [],
    footer:
      'Countersign never submits. Check the form, then submit it yourself.',
  };

  const count = plan.writes.length;
  if (count > 0) {
    view.button = `Fill ${count} empty ${plural(count, 'field', 'fields')}`;
  } else if (!state.applyFailed) {
    view.nothing = 'Nothing to fill.';
  }

  if (state.filled !== undefined) {
    view.filledLine = `Filled ${state.filled} ${plural(state.filled, 'field', 'fields')}.`;
  }
  if (state.applyFailed) {
    view.error =
      'Countersign could not confirm the fill. Check the form before you submit it.';
  }

  const seen = new Set<string>();
  for (const frame of plan.frames) {
    if (seen.has(frame.site)) continue;
    seen.add(frame.site);
    view.frames.push(frameSentence(frame.site));
  }

  for (const row of state.failed) {
    view.notFilled.push(viewRow(row, `failed-${row.ref}`, [reasonLine(row)]));
  }
  for (const row of plan.rows) {
    const key = String(row.ref);
    switch (row.status) {
      case 'will_fill':
        view.willFill.push(viewRow(row, key, [willFillLine(row)]));
        break;
      case 'matches':
        view.matches.push(viewRow(row, key, [row.formValue]));
        break;
      case 'differs':
        view.differs.push(
          viewRow(row, key, [
            `form: ${row.formValue}`,
            `yours: ${row.ownValue}`,
          ]),
        );
        break;
      case 'not_filled':
        view.notFilled.push(viewRow(row, key, [reasonLine(row)]));
        break;
    }
  }

  const optional = plan.unrecognisedOptional;
  if (optional > 0) {
    view.optionalLine = `${optional} optional ${plural(optional, 'field', 'fields')} not recognised`;
  }
  return view;
}
