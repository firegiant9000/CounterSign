import { isPlaceholderOption } from '../../../core/src/fill/normalize';
import {
  MAX_AUTOCOMPLETE,
  MAX_FIELDS,
  MAX_OPTIONS,
  MAX_VALUE,
  type ControlKind,
  type FormScan,
  type ScannedField,
} from '../../../core/src/fill/types';
import { fieldLabel, groupLabel } from './label';

export interface FieldElements {
  control: ControlKind;
  /** The element, or the first member of a group. */
  el: Element;
  /** The <option> elements or the group's inputs, in step with the field's options. */
  options: Element[];
}

export interface PageScan {
  scan: FormScan;
  /** elements[i] belongs to the field with ref i. */
  elements: FieldElements[];
}

const MAX_OPTION_TEXT = 300;

const INPUT_TYPES = new Set([
  '',
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'radio',
  'checkbox',
  'file',
]);

const AUTOFILL_BLOCKED = new Set([
  'current-password',
  'new-password',
  'one-time-code',
]);

function inputType(el: Element): string {
  return (el.getAttribute('type') ?? '').trim().toLowerCase();
}

function isAllowed(el: Element): boolean {
  switch (el.localName) {
    case 'textarea':
    case 'select':
      return true;
    case 'input':
      return INPUT_TYPES.has(inputType(el));
    default:
      return false;
  }
}

function lastToken(raw: string | null): string {
  const tokens = (raw ?? '').trim().toLowerCase().split(/\s+/);
  return (tokens[tokens.length - 1] ?? '').slice(0, MAX_AUTOCOMPLETE);
}

function cut(text: string, max: number): string {
  return text.trim().slice(0, max);
}

function isHiddenByAttribute(el: Element): boolean {
  return (
    el.hasAttribute('hidden') ||
    el.hasAttribute('inert') ||
    el.getAttribute('aria-hidden') === 'true'
  );
}

function isHiddenByStyle(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

function isHidden(el: Element): boolean {
  const checkStyle = !(el.localName === 'input' && inputType(el) === 'file');
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (isHiddenByAttribute(cur)) return true;
    if (checkStyle && isHiddenByStyle(cur)) return true;
  }
  return false;
}

function isDisabled(el: Element): boolean {
  return (
    el.hasAttribute('disabled') || el.closest('fieldset[disabled]') !== null
  );
}

function isSkipped(el: Element): boolean {
  if (isDisabled(el) || el.hasAttribute('readonly')) return true;
  const token = lastToken(el.getAttribute('autocomplete'));
  if (AUTOFILL_BLOCKED.has(token) || token.startsWith('cc-')) return true;
  return isHidden(el);
}

function isCandidate(el: Element): boolean {
  return isAllowed(el) && !isSkipped(el);
}

function isCustom(el: Element): boolean {
  if (el.getAttribute('role') === 'combobox') return true;
  const popup = el.getAttribute('aria-haspopup');
  if (popup !== null && popup !== 'false') return true;
  const auto = el.getAttribute('aria-autocomplete');
  return auto !== null && auto !== 'none';
}

function controlOf(el: Element): ControlKind {
  if (isCustom(el)) return 'custom';
  switch (el.localName) {
    case 'textarea':
      return 'textarea';
    case 'select':
      return 'select';
    default:
      break;
  }
  const type = inputType(el);
  if (type === 'file') return 'file';
  if (type === 'date') return 'date';
  if (type === 'radio' || type === 'checkbox') return 'choice_group';
  return 'text';
}

function isRequired(el: Element): boolean {
  return (
    el.hasAttribute('required') || el.getAttribute('aria-required') === 'true'
  );
}

function valueOf(el: Element): string {
  return cut(
    (el as HTMLInputElement | HTMLTextAreaElement).value ?? '',
    MAX_VALUE,
  );
}

interface Built {
  field: Omit<ScannedField, 'ref'>;
  elements: FieldElements;
}

function buildSelect(el: HTMLSelectElement): Built {
  const all = Array.from(el.options);
  const kept: HTMLOptionElement[] = [];
  let truncated = false;
  all.forEach((option, index) => {
    if (isPlaceholderOption(option.text, option.value, index)) return;
    if (kept.length >= MAX_OPTIONS) {
      truncated = true;
      return;
    }
    kept.push(option);
  });
  const chosen = el.selectedIndex >= 0 ? all[el.selectedIndex] : undefined;
  const value =
    chosen && !isPlaceholderOption(chosen.text, chosen.value, chosen.index)
      ? cut(chosen.text, MAX_VALUE)
      : '';
  return {
    field: {
      control: 'select',
      label: fieldLabel(el, isCandidate),
      autocomplete: lastToken(el.getAttribute('autocomplete')),
      required: isRequired(el),
      value,
      options: kept.map((o) => cut(o.text, MAX_OPTION_TEXT)),
      checked: [],
      multiple: el.multiple,
      optionsTruncated: truncated,
    },
    elements: { control: 'select', el, options: kept },
  };
}

function buildGroup(members: HTMLInputElement[]): Built {
  const first = members[0] as HTMLInputElement;
  const kept = members.slice(0, MAX_OPTIONS);
  const options = kept.map((member) =>
    cut(
      fieldLabel(member, isCandidate) || (member.getAttribute('value') ?? ''),
      MAX_OPTION_TEXT,
    ),
  );
  const checked: number[] = [];
  kept.forEach((member, index) => {
    if (member.checked) checked.push(index);
  });
  return {
    field: {
      control: 'choice_group',
      label: groupLabel(members, isCandidate),
      autocomplete: lastToken(first.getAttribute('autocomplete')),
      required: members.some(isRequired),
      value: '',
      options,
      checked,
      multiple: inputType(first) === 'checkbox',
      optionsTruncated: members.length > MAX_OPTIONS,
    },
    elements: { control: 'choice_group', el: first, options: kept },
  };
}

function buildSingle(el: Element, control: ControlKind): Built {
  const plain =
    control === 'text' || control === 'textarea' || control === 'date';
  return {
    field: {
      control,
      label: fieldLabel(el, isCandidate),
      autocomplete: lastToken(el.getAttribute('autocomplete')),
      required: isRequired(el),
      value: plain ? valueOf(el) : '',
      options: [],
      checked: [],
      multiple: false,
      optionsTruncated: false,
    },
    elements: { control, el, options: [] },
  };
}

interface Slot {
  control: ControlKind;
  el: Element;
  /** Set for a choice group: every member, in document order. */
  members?: HTMLInputElement[];
}

export function scanForm(doc: Document): PageScan {
  const candidates = Array.from(
    doc.querySelectorAll('input, textarea, select'),
  ).filter(isCandidate);

  const groups = new Map<string, HTMLInputElement[]>();
  const slots: Slot[] = [];

  for (const el of candidates) {
    const control = controlOf(el);
    if (control !== 'choice_group') {
      slots.push({ control, el });
      continue;
    }
    const input = el as HTMLInputElement;
    const name = el.getAttribute('name') ?? '';
    const key = `${inputType(el)}:${name}`;
    const existing = name === '' ? undefined : groups.get(key);
    if (existing) {
      existing.push(input);
      continue;
    }
    const members = [input];
    if (name !== '') groups.set(key, members);
    slots.push({ control, el, members });
  }

  const built = slots.slice(0, MAX_FIELDS).map((slot): Built => {
    if (slot.members) return buildGroup(slot.members);
    if (slot.control === 'select')
      return buildSelect(slot.el as HTMLSelectElement);
    return buildSingle(slot.el, slot.control);
  });

  return {
    scan: {
      fields: built.map((b, ref) => ({ ref, ...b.field })),
      frames: [],
      truncated: slots.length > MAX_FIELDS,
    },
    elements: built.map((b) => b.elements),
  };
}
