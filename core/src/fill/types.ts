import type { ProfileKey } from '../profile';
import type { AnswerValue, CanonicalAnswer } from '../types';

export const MAX_FIELDS = 200;
export const MAX_OPTIONS = 50;
export const MAX_LABEL = 300;
export const MAX_VALUE = 500;
export const MAX_FRAMES = 5;
export const MAX_FRAME_SRC = 2_000;
export const MAX_AUTOCOMPLETE = 40;

export const CONTROL_KINDS = [
  'text',
  'textarea',
  'date',
  'select',
  'choice_group',
  'file',
  'custom',
] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];

export interface ScannedField {
  /** The field's number in the page script's list for this scan. */
  ref: number;
  control: ControlKind;
  /** '' when none was found. */
  label: string;
  /** Last token, lower case; '' when absent. */
  autocomplete: string;
  required: boolean;
  /** Text, textarea, date: the value. Select: the chosen option's text, '' on a placeholder. Others: ''. */
  value: string;
  /** Select (placeholders left out) and choice_group; [] otherwise. */
  options: string[];
  /** Choice_group: indexes into options; [] otherwise. */
  checked: number[];
  /** A checkbox group or a multi-select. */
  multiple: boolean;
  /** The page had more than MAX_OPTIONS options. */
  optionsTruncated: boolean;
}

export interface FormScan {
  fields: ScannedField[];
  frames: string[];
  truncated: boolean;
}

export type FillWrite =
  | { ref: number; kind: 'value'; value: string }
  | { ref: number; kind: 'option'; index: number };

export const WRITE_OUTCOMES = [
  'written',
  'gone',
  'not_empty',
  'failed',
] as const;
export type WriteOutcome = (typeof WRITE_OUTCOMES)[number];

export interface WriteReport {
  ref: number;
  outcome: WriteOutcome;
}

export interface ApplyResult {
  outcomes: WriteReport[];
  scan: FormScan;
}

export type FillTarget =
  { kind: 'profile'; key: ProfileKey } | { kind: 'answer'; key: string };

export type RowStatus = 'will_fill' | 'matches' | 'differs' | 'not_filled';

export type NotFilledReason =
  | 'no_value'
  | 'custom_control'
  | 'unsupported_control'
  | 'never_auto'
  | 'ambiguous'
  | 'negated'
  | 'other_country'
  | 'file'
  | 'not_recognised'
  | 'changed';

export interface PlanRow {
  ref: number;
  label: string;
  control: ControlKind;
  required: boolean;
  /** Absent on file and not_recognised rows. */
  target?: FillTarget;
  status: RowStatus;
  /** Set exactly when status is 'not_filled'. */
  reason?: NotFilledReason;
  /** What the form holds now, as text. */
  formValue: string;
  /** The owner's value as text; '' when there is none or it must not be offered. */
  ownValue: string;
  /** Set exactly when status is 'will_fill'. */
  write?: FillWrite;
  /** Answer targets that have a value. */
  answerValue?: AnswerValue;
}

export interface FrameAdvice {
  site: 'greenhouse' | 'ashby';
  src: string;
}

export interface FillPlan {
  rows: PlanRow[];
  writes: FillWrite[];
  unrecognisedOptional: number;
  frames: FrameAdvice[];
}

export interface PlanInput {
  profile: Partial<Record<ProfileKey, string>>;
  answers: readonly CanonicalAnswer[];
}
