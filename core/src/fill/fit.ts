import { sameText } from './compare';
import type { FillWrite, ScannedField } from './types';

export type OwnKind = 'text' | 'place' | 'yes_no' | 'choice' | 'date';

export type FitResult =
  | { fit: 'write'; write: FillWrite }
  | { fit: 'holds'; formValue: string }
  | { fit: 'none'; reason: 'custom_control' | 'unsupported_control' };

const UNSUPPORTED: FitResult = { fit: 'none', reason: 'unsupported_control' };

function isYesNo(options: string[]): boolean {
  if (options.length !== 2) return false;
  const [a, b] = options as [string, string];
  return (
    (sameText(a, 'Yes') && sameText(b, 'No')) ||
    (sameText(a, 'No') && sameText(b, 'Yes'))
  );
}

function controlFits(field: ScannedField, kind: OwnKind): boolean {
  const isSelect = field.control === 'select';
  const isGroup = field.control === 'choice_group';
  switch (kind) {
    case 'text':
      return field.control === 'text' || field.control === 'textarea';
    case 'place':
      return (
        field.control === 'text' ||
        field.control === 'textarea' ||
        (isSelect && !field.multiple)
      );
    case 'yes_no':
      return (
        ((isSelect && !field.multiple) || isGroup) && isYesNo(field.options)
      );
    case 'choice':
      return (isSelect && !field.multiple) || isGroup;
    case 'date':
      return field.control === 'date';
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/**
 * Decides whether one saved value can be written into one scanned control.
 * Any doubt comes out as "holds" or "none", never as "write".
 */
export function fitField(
  field: ScannedField,
  kind: OwnKind,
  own: string,
): FitResult {
  // 1. Controls the filler never touches.
  if (field.control === 'custom') {
    return { fit: 'none', reason: 'custom_control' };
  }
  if (field.control === 'file') return UNSUPPORTED;

  // 2. Does the control fit the kind.
  if (!controlFits(field, kind)) return UNSUPPORTED;

  const isList = field.control === 'select' || field.control === 'choice_group';

  // 3. A truncated option list cannot be trusted.
  if (isList && field.optionsTruncated) return UNSUPPORTED;

  // 4. Never replace what is already there.
  if (field.control === 'choice_group') {
    if (field.checked.length > 0) {
      const formValue = field.checked
        .map((i) => field.options[i] ?? '')
        .join(', ');
      return { fit: 'holds', formValue };
    }
  } else if (field.value !== '') {
    return { fit: 'holds', formValue: field.value };
  }

  // 5. Pick the one matching option.
  if (isList) {
    let found = -1;
    for (let i = 0; i < field.options.length; i++) {
      if (sameText(field.options[i] ?? '', own)) {
        if (found !== -1) return UNSUPPORTED;
        found = i;
      }
    }
    if (found === -1) return UNSUPPORTED;
    return {
      fit: 'write',
      write: { ref: field.ref, kind: 'option', index: found },
    };
  }

  // 6. Plain value write.
  return {
    fit: 'write',
    write: { ref: field.ref, kind: 'value', value: own },
  };
}
