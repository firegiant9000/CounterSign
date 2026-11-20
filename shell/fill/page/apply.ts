import { isPlaceholderOption } from '../../../core/src/fill/normalize';
import {
  MAX_FIELDS,
  MAX_VALUE,
  type WriteReport,
} from '../../../core/src/fill/types';
import { notifyChanged } from './events';
import type { FieldElements } from './scan';

type Write =
  | { ref: number; kind: 'value'; value: string }
  | { ref: number; kind: 'option'; index: number };

const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(entry: unknown): entry is Record<string, unknown> {
  return typeof entry === 'object' && entry !== null && !Array.isArray(entry);
}

/** The write when its shape is right, otherwise null. The ref is checked by the caller. */
function readWrite(entry: Record<string, unknown>, ref: number): Write | null {
  const kind = entry.kind;
  if (kind === 'value') {
    const value = entry.value;
    if (typeof value !== 'string' || value.length > MAX_VALUE) return null;
    return { ref, kind, value };
  }
  if (kind === 'option') {
    const index = entry.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      return null;
    }
    return { ref, kind, index };
  }
  return null;
}

function isDisabled(el: Element): boolean {
  return (
    el.hasAttribute('disabled') || el.closest('fieldset[disabled]') !== null
  );
}

function isOptionDisabled(option: Element): boolean {
  return (
    option.hasAttribute('disabled') ||
    option.closest('optgroup[disabled]') !== null
  );
}

type Setter = (this: Element, value: never) => void;

/** A property setter from the element's own window, or undefined. */
function protoSetter(
  el: Element,
  ctor: 'HTMLInputElement' | 'HTMLTextAreaElement' | 'HTMLSelectElement',
  property: 'value' | 'selectedIndex' | 'checked',
): Setter | undefined {
  const view = el.ownerDocument.defaultView;
  const proto = view?.[ctor]?.prototype;
  if (!proto) return undefined;
  // The setter is always called with .call on the element.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return Object.getOwnPropertyDescriptor(proto, property)?.set as
    Setter | undefined;
}

function applyOne(
  fe: FieldElements | undefined,
  write: Write,
): WriteReport['outcome'] {
  if (!fe || !fe.el.isConnected) return 'gone';
  const { control, el } = fe;

  if (control === 'text' || control === 'textarea' || control === 'date') {
    if (write.kind !== 'value') return 'failed';
    if (isDisabled(el) || el.hasAttribute('readonly')) return 'failed';
    if (control === 'date' && !DATE_VALUE.test(write.value)) return 'failed';
    const setter = protoSetter(
      el,
      el.localName === 'textarea' ? 'HTMLTextAreaElement' : 'HTMLInputElement',
      'value',
    );
    if (!setter) return 'failed';
    if ((el as HTMLInputElement).value !== '') return 'not_empty';
    setter.call(el, write.value as never);
    notifyChanged(el);
    return 'written';
  }

  if (control === 'select') {
    if (write.kind !== 'option') return 'failed';
    if (el.localName !== 'select') return 'failed';
    if (isDisabled(el) || el.hasAttribute('readonly')) return 'failed';
    const option = fe.options[write.index];
    if (!option || option.localName !== 'option') return 'failed';
    if (isOptionDisabled(option)) return 'failed';
    const setter = protoSetter(el, 'HTMLSelectElement', 'selectedIndex');
    if (!setter) return 'failed';
    const select = el as HTMLSelectElement;
    const chosen = select.options[select.selectedIndex];
    if (
      chosen &&
      !isPlaceholderOption(chosen.text, chosen.value, chosen.index)
    ) {
      return 'not_empty';
    }
    setter.call(el, (option as HTMLOptionElement).index as never);
    notifyChanged(el);
    return 'written';
  }

  if (control === 'choice_group') {
    if (write.kind !== 'option') return 'failed';
    if (isDisabled(el) || el.hasAttribute('readonly')) return 'failed';
    const member = fe.options[write.index];
    if (!member || member.localName !== 'input') return 'failed';
    if (isDisabled(member)) return 'failed';
    if (!member.isConnected) return 'gone';
    const setter = protoSetter(member, 'HTMLInputElement', 'checked');
    if (!setter) return 'failed';
    const anyChecked = fe.options.some(
      (m) => (m as HTMLInputElement).checked === true,
    );
    if (anyChecked) return 'not_empty';
    setter.call(member, true as never);
    notifyChanged(member);
    return 'written';
  }

  return 'failed';
}

/** Sets the given values into empty fields. Never replaces a value. */
export function applyWrites(
  elements: readonly FieldElements[],
  writes: unknown,
): WriteReport[] {
  if (!Array.isArray(writes)) return [];
  const reports: WriteReport[] = [];
  const count = Math.min(writes.length, MAX_FIELDS);
  for (let i = 0; i < count; i++) {
    let ref: number | undefined;
    try {
      const entry: unknown = writes[i];
      if (!isRecord(entry)) continue;
      const rawRef = entry.ref;
      if (typeof rawRef !== 'number' || !Number.isInteger(rawRef)) continue;
      ref = rawRef;
      const write = readWrite(entry, ref);
      if (!write) {
        reports.push({ ref, outcome: 'failed' });
        continue;
      }
      const fe = ref >= 0 ? elements[ref] : undefined;
      reports.push({ ref, outcome: applyOne(fe, write) });
    } catch {
      if (ref !== undefined) reports.push({ ref, outcome: 'failed' });
    }
  }
  return reports;
}
