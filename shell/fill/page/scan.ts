import { isPlaceholderOption } from '../../../core/src/fill/normalize';
import { FRAME_HOSTS } from '../../../core/src/fill/site';
import {
  MAX_AUTOCOMPLETE,
  MAX_FIELDS,
  MAX_FRAMES,
  MAX_FRAME_SRC,
  MAX_LABEL,
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
  return (el.getAttribute('type') ?? '').toLowerCase();
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

function tokensOf(raw: string | null): string[] {
  return (raw ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== '');
}

function lastToken(raw: string | null): string {
  const tokens = tokensOf(raw);
  return (tokens[tokens.length - 1] ?? '').slice(0, MAX_AUTOCOMPLETE);
}

function cut(text: string, max: number): string {
  return text.trim().slice(0, max).trim();
}

function isOptionDisabled(option: Element): boolean {
  return (
    option.hasAttribute('disabled') ||
    option.closest('optgroup[disabled]') !== null
  );
}

function isHiddenByAttribute(el: Element): boolean {
  return (
    el.hasAttribute('hidden') ||
    el.hasAttribute('inert') ||
    (el.getAttribute('aria-hidden') ?? '').trim().toLowerCase() === 'true'
  );
}

function isHiddenByStyle(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

/** Custom-styled radios and checkboxes are often opacity:0; the file input is exempt from style checks. */
function isTextLike(el: Element): boolean {
  if (el.localName !== 'input') return true;
  const type = inputType(el);
  return type !== 'radio' && type !== 'checkbox' && type !== 'file';
}

function isTinyPx(value: string): boolean {
  const px = Number.parseFloat(value);
  return Number.isFinite(px) && px <= 1;
}

/** happy-dom does no layout and reports an all-zero box; only trust a box with layout information. */
function hasLayout(box: DOMRect): boolean {
  return box.width !== 0 || box.height !== 0 || box.left !== 0 || box.top !== 0;
}

/** Expands the 1 to 4 value shorthand to [top, right, bottom, left]. */
function expandSides(parts: string[]): string[] | undefined {
  const a = parts[0];
  if (parts.length < 1 || parts.length > 4 || a === undefined) return undefined;
  const b = parts[1] ?? a;
  return [a, b, parts[2] ?? a, parts[3] ?? b];
}

function insetCollapses(args: string, box: DOMRect | undefined): boolean {
  const body = (args.split(/\sround\s/i)[0] ?? '').trim();
  const sides = expandSides(body.split(/\s+/).filter((p) => p !== ''));
  if (!sides) return false;
  const parsed = sides.map((side) => {
    const m = /^(-?\d+(?:\.\d+)?)(%|px)?$/.exec(side);
    if (!m) return undefined;
    return { n: Number(m[1]), unit: m[2] ?? (m[1] === '0' ? 'px' : '') };
  });
  if (parsed.some((p) => p === undefined)) return false;
  const [top, right, bottom, left] = parsed as {
    n: number;
    unit: string;
  }[] as [
    { n: number; unit: string },
    { n: number; unit: string },
    { n: number; unit: string },
    { n: number; unit: string },
  ];
  const axis = (
    one: { n: number; unit: string },
    two: { n: number; unit: string },
    size: number | undefined,
  ): boolean => {
    // A zero offset has no unit that matters; the other side decides.
    const unit = one.n === 0 ? two.unit : one.unit;
    if (two.n !== 0 && two.unit !== unit) return false;
    const sum = one.n + two.n;
    if (unit === '%') return sum >= 100;
    return unit === 'px' && size !== undefined && sum >= size;
  };
  const laidOut = box !== undefined && hasLayout(box);
  return (
    axis(left, right, laidOut ? box.width : undefined) ||
    axis(top, bottom, laidOut ? box.height : undefined)
  );
}

function isClipped(style: CSSStyleDeclaration, box?: DOMRect): boolean {
  const rect = /^\s*rect\(([^)]*)\)\s*$/i.exec(style.clip);
  if (rect) {
    const nums = (rect[1] ?? '')
      .split(/[\s,]+/)
      .filter((part) => part !== '')
      .map((part) => Number.parseFloat(part));
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      const [top, right, bottom, left] = nums as [
        number,
        number,
        number,
        number,
      ];
      if (right - left <= 1 || bottom - top <= 1) return true;
    }
  }
  const path = style.clipPath.trim().toLowerCase();
  const inset = /^inset\(([^)]*)\)$/.exec(path);
  if (inset && insetCollapses(inset[1] ?? '', box)) return true;
  const compact = path.replace(/\s+/g, '');
  return compact === 'circle(0)' || compact === 'circle(0px)';
}

function containOf(style: CSSStyleDeclaration): string {
  return style.getPropertyValue('contain');
}

/** contain:paint (or strict/content) clips like overflow:clip on both axes. */
function paintContains(style: CSSStyleDeclaration): boolean {
  return /\b(paint|strict|content)\b/.test(containOf(style));
}

const CONTAINING_PROPERTIES = [
  'transform',
  'perspective',
  'filter',
  'backdrop-filter',
  'translate',
  'rotate',
  'scale',
];

/** A box that is a containing block for absolute and fixed descendants without being positioned. */
function makesContainingBlock(style: CSSStyleDeclaration): boolean {
  for (const name of CONTAINING_PROPERTIES) {
    const value = style.getPropertyValue(name).trim();
    if (value !== '' && value !== 'none') return true;
  }
  if (
    /\b(transform|perspective|filter)\b/.test(
      style.getPropertyValue('will-change'),
    )
  ) {
    return true;
  }
  return paintContains(style) || /\blayout\b/.test(containOf(style));
}

function clipsOverflow(style: CSSStyleDeclaration): boolean {
  if (paintContains(style)) return true;
  return [style.overflow, style.overflowX, style.overflowY].some(
    (v) => v !== '' && v !== 'visible',
  );
}

function overflowOn(style: CSSStyleDeclaration, axis: 'x' | 'y'): string {
  const own = axis === 'x' ? style.overflowX : style.overflowY;
  return own === '' ? style.overflow : own;
}

/** Any overflow but visible: the parent clips this axis (it may scroll). */
function clipsAxis(style: CSSStyleDeclaration, axis: 'x' | 'y'): boolean {
  if (paintContains(style)) return true;
  const value = overflowOn(style, axis);
  return value !== '' && value !== 'visible';
}

/** hidden or clip: the parent clips this axis and the user cannot scroll it. */
function cutsAxis(style: CSSStyleDeclaration, axis: 'x' | 'y'): boolean {
  if (paintContains(style)) return true;
  const value = overflowOn(style, axis);
  return value === 'hidden' || value === 'clip';
}

function isPositioned(style: CSSStyleDeclaration): boolean {
  return style.position !== '' && style.position !== 'static';
}

type Escape = 'none' | 'absolute' | 'fixed';

/** How far an element's box escapes ancestor overflow, given what it inherits from below. */
function escapeOf(style: CSSStyleDeclaration, below: Escape): Escape {
  if (below === 'fixed' || style.position === 'fixed') return 'fixed';
  if (style.position === 'absolute') return 'absolute';
  return below;
}

// contentVisibilityAuto is left off on purpose. The spec makes checkVisibility
// return false for a content-visibility:hidden ancestor regardless of options,
// and the content of a closed <details> has no client rects, which the empty
// getClientRects() check catches.
const VISIBILITY_OPTIONS = {
  opacityProperty: true,
  visibilityProperty: true,
};

function isUnrendered(el: Element, options: object): boolean {
  const probe = el as Element & {
    checkVisibility?: (options?: object) => boolean;
  };
  if (typeof probe.checkVisibility !== 'function') return false;
  if (!probe.checkVisibility(options)) return true;
  // Firefox gives an unrendered element (closed details, content-visibility)
  // an empty client rect list; happy-dom lists one rect.
  return el.getClientRects().length === 0;
}

/** Hidden to the eye without display:none: invisible, clipped, tiny, collapsed by a parent or off the page. */
function isVisuallyHidden(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  if (isUnrendered(el, VISIBILITY_OPTIONS)) return true;
  const style = view.getComputedStyle(el);
  if (Number.parseFloat(style.opacity) === 0) return true;
  const box = el.getBoundingClientRect();
  const laidOut = hasLayout(box);
  const doc = el.ownerDocument;
  // An absolute box escapes the overflow of ancestors up to its containing
  // block (the nearest positioned one); a fixed box escapes all of them. A
  // transform, filter, perspective, will-change or contain on an ancestor makes
  // it the containing block for both.
  let escaping = escapeOf(style, 'none');
  for (
    let cur: Element | null = el.parentElement;
    cur;
    cur = cur.parentElement
  ) {
    const parent = view.getComputedStyle(cur);
    const block = makesContainingBlock(parent);
    const contained =
      escaping === 'none' ||
      block ||
      (escaping === 'absolute' && isPositioned(parent));
    escaping = escapeOf(parent, contained ? 'none' : escaping);
    if (Number.parseFloat(parent.opacity) === 0) return true;
    if (isClipped(parent)) return true;
    // The root and body overflow propagates to the viewport and clips nothing;
    // inline and contents boxes ignore overflow.
    if (cur === doc.documentElement || cur === doc.body) continue;
    if (parent.display === 'inline' || parent.display === 'contents') continue;
    if (!contained || !clipsOverflow(parent)) continue;
    // A clipping parent of 1px or less across a clipped axis hides the field.
    // When the field has layout, the parent's box is real, so an all-zero box
    // is a true 0x0 wrapper; without layout (tests), use the computed size.
    const parentBox = cur.getBoundingClientRect();
    const narrow = laidOut ? parentBox.width <= 1 : isTinyPx(parent.width);
    const short = laidOut ? parentBox.height <= 1 : isTinyPx(parent.height);
    if (narrow && clipsAxis(parent, 'x')) return true;
    if (short && clipsAxis(parent, 'y')) return true;
    // A parent that cannot be scrolled (hidden or clip) also hides a field
    // pushed out of its box. auto and scroll are left out: the user can
    // scroll to the field.
    if (!laidOut || !hasLayout(parentBox)) continue;
    const across =
      Math.min(box.right, parentBox.right) - Math.max(box.left, parentBox.left);
    const down =
      Math.min(box.bottom, parentBox.bottom) - Math.max(box.top, parentBox.top);
    if (across <= 1 && cutsAxis(parent, 'x')) return true;
    if (down <= 1 && cutsAxis(parent, 'y')) return true;
  }
  if (isClipped(style, box)) return true;
  if (isTinyPx(style.width) || isTinyPx(style.height)) return true;
  if (!hasLayout(box)) return false;
  if (box.width <= 1 || box.height <= 1) return true;
  if (box.bottom + view.scrollY < 0) return true;
  const root = doc.documentElement;
  if (view.getComputedStyle(root).direction === 'rtl') {
    // Firefox rtl: the document origin is at the right, scrollX <= 0, and the
    // right edge of the document sits at clientWidth - scrollX in viewport
    // coordinates. Content to the left is reachable by scrolling, so only a box
    // starting at or beyond that right edge is off the page.
    return box.left + view.scrollX >= root.clientWidth;
  }
  return box.right + view.scrollX < 0;
}

function isHidden(el: Element): boolean {
  const checkStyle = !(el.localName === 'input' && inputType(el) === 'file');
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (isHiddenByAttribute(cur)) return true;
    if (checkStyle && isHiddenByStyle(cur)) return true;
  }
  if (isTextLike(el)) return isVisuallyHidden(el);
  // Radios and checkboxes may be opacity:0, but not unrendered (closed details).
  if (checkStyle) {
    return isUnrendered(el, { visibilityProperty: true });
  }
  return false;
}

/** The form owner: the form attribute wins over the nearest ancestor form (the same as input.form in a browser). */
function formOwner(el: Element): Element | null {
  const id = el.getAttribute('form');
  if (id !== null) {
    const target = el.ownerDocument.getElementById(id);
    return target?.localName === 'form' ? target : null;
  }
  return el.closest('form');
}

/** A radio that is not a candidate but is checked, in the same browser group (same form owner and name). */
export function hasCheckedPeer(first: HTMLInputElement, name: string): boolean {
  const owner = formOwner(first);
  return Array.from(first.ownerDocument.querySelectorAll('input')).some(
    (other) =>
      inputType(other) === 'radio' &&
      other.getAttribute('name') === name &&
      formOwner(other) === owner &&
      other.checked &&
      !isCandidate(other),
  );
}

function isDisabled(el: Element): boolean {
  return (
    el.hasAttribute('disabled') || el.closest('fieldset[disabled]') !== null
  );
}

function isSkipped(el: Element): boolean {
  if (isDisabled(el) || el.hasAttribute('readonly')) return true;
  const blocked = tokensOf(el.getAttribute('autocomplete')).some(
    (token) => AUTOFILL_BLOCKED.has(token) || token.startsWith('cc-'),
  );
  if (blocked) return true;
  return isHidden(el);
}

export function isCandidate(el: Element): boolean {
  return isAllowed(el) && !isSkipped(el);
}

function isCustom(el: Element): boolean {
  if (tokensOf(el.getAttribute('role')).includes('combobox')) return true;
  const popup = el.getAttribute('aria-haspopup');
  if (popup !== null && popup !== 'false') return true;
  const auto = el.getAttribute('aria-autocomplete');
  return auto !== null && auto !== 'none';
}

export function controlOf(el: Element): ControlKind {
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
    if (isOptionDisabled(option)) return;
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
      options: kept.map((o) => cut(o.text, MAX_LABEL)),
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
      MAX_LABEL,
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

const FIELD_SELECTOR = 'input, textarea, select';

function candidatesIn(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(FIELD_SELECTOR)).filter(isCandidate);
}

/** Groups by form owner as the browser does: a radio can sit inside one form and belong to another through its form attribute. */
function groupKey(owners: Map<Element | null, number>, el: Element): string {
  const owner = formOwner(el);
  if (!owners.has(owner)) owners.set(owner, owners.size);
  return `${owners.get(owner)}|${inputType(el)}:${el.getAttribute('name') ?? ''}`;
}

/** Counts a choice group as one field, as the scan does. */
function countSlots(candidates: Element[]): number {
  const seen = new Set<string>();
  const owners = new Map<Element | null, number>();
  let count = 0;
  for (const el of candidates) {
    const name = el.getAttribute('name') ?? '';
    if (controlOf(el) !== 'choice_group' || name === '') {
      count += 1;
      continue;
    }
    const key = groupKey(owners, el);
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}

function chooseCandidates(doc: Document): Element[] {
  let best: Element[] = [];
  let bestCount = 0;
  for (const form of Array.from(doc.querySelectorAll('form'))) {
    const found = candidatesIn(form);
    const count = countSlots(found);
    if (count > bestCount) {
      best = found;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : candidatesIn(doc);
}

function scanFrames(doc: Document): string[] {
  const frames: string[] = [];
  for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
    if (frames.length >= MAX_FRAMES) break;
    const src = frame.getAttribute('src');
    if (!src) continue;
    let url: URL;
    try {
      url = new URL(src, doc.baseURI);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:') continue;
    if (!FRAME_HOSTS.has(url.hostname.toLowerCase())) continue;
    frames.push(url.href.slice(0, MAX_FRAME_SRC));
  }
  return frames;
}

export function scanForm(doc: Document): PageScan {
  const candidates = chooseCandidates(doc);

  const groups = new Map<string, HTMLInputElement[]>();
  const slots: Slot[] = [];
  const blocked = new Set<string>();
  const owners = new Map<Element | null, number>();

  for (const el of candidates) {
    const control = controlOf(el);
    if (control !== 'choice_group') {
      slots.push({ control, el });
      continue;
    }
    const input = el as HTMLInputElement;
    const name = el.getAttribute('name') ?? '';
    // Group by form owner as the browser does: a radio can sit inside one
    // form and belong to another through its form attribute.
    const key = groupKey(owners, el);
    if (blocked.has(key)) continue;
    const existing = name === '' ? undefined : groups.get(key);
    if (existing) {
      existing.push(input);
      continue;
    }
    // A checked radio we cannot fill still holds the group's value, and
    // checking another member would clear it. Leave the whole group out.
    if (
      name !== '' &&
      inputType(el) === 'radio' &&
      hasCheckedPeer(input, name)
    ) {
      blocked.add(key);
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
      frames: scanFrames(doc),
      truncated: slots.length > MAX_FIELDS,
    },
    elements: built.map((b) => b.elements),
  };
}
