import { MAX_LABEL } from '../../../core/src/fill/types';

// Finds the question text for a field or a group of fields. Reads the DOM only.

const SKIPPED = new Set([
  'input',
  'select',
  'textarea',
  'button',
  'option',
  'script',
  'style',
]);
const FIELDS = 'input, select, textarea';
const GROUP_ANCESTOR = 'fieldset, [role="group"], [role="radiogroup"]';

function tidy(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL).trim();
}

function collect(
  node: Node,
  left: ReadonlySet<Element>,
  parts: string[],
): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      parts.push(child.textContent ?? '');
    } else if (child.nodeType === 1) {
      const el = child as Element;
      if (!SKIPPED.has(el.localName) && !left.has(el)) {
        collect(el, left, parts);
      }
    }
  }
}

function textOf(node: Node, left: ReadonlySet<Element> = new Set()): string {
  const parts: string[] = [];
  collect(node, left, parts);
  return tidy(parts.join(' '));
}

function labelledBy(el: Element): string {
  const ids = (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter((id) => id !== '');
  const texts: string[] = [];
  for (const id of ids) {
    const target = el.ownerDocument.getElementById(id);
    if (target) texts.push(textOf(target));
  }
  return tidy(texts.filter((t) => t !== '').join(' '));
}

function labelsFor(el: Element): Element[] {
  const id = el.getAttribute('id') ?? '';
  if (id === '') return [];
  return Array.from(el.ownerDocument.querySelectorAll('label')).filter(
    (label) => label.getAttribute('for') === id,
  );
}

function isRoot(el: Element): boolean {
  return el.localName === 'form' || el.localName === 'body';
}

function holdsOther(
  container: Element,
  allowed: readonly Element[],
  isCandidate: (other: Element) => boolean,
): boolean {
  return Array.from(container.querySelectorAll(FIELDS)).some(
    (other) => !allowed.includes(other) && isCandidate(other),
  );
}

// Climbs from the field's parent. Only empty containers are passed over; the
// first one with text wins; one that holds another candidate ends the search.
function containerText(
  start: Element | null,
  members: readonly Element[],
  isCandidate: (other: Element) => boolean,
  left: ReadonlySet<Element>,
): string {
  for (let cur = start; cur && !isRoot(cur); cur = cur.parentElement) {
    if (holdsOther(cur, members, isCandidate)) return '';
    if (left.has(cur) || !members.every((m) => cur.contains(m))) continue;
    const text = textOf(cur, left);
    if (text !== '') return text;
  }
  return '';
}

export function fieldLabel(
  el: Element,
  isCandidate: (other: Element) => boolean,
): string {
  const named = labelledBy(el);
  if (named !== '') return named;

  for (const label of labelsFor(el)) {
    const text = textOf(label);
    if (text !== '') return text;
  }

  const wrapping = el.closest('label');
  if (wrapping) {
    const text = textOf(wrapping);
    if (text !== '') return text;
  }

  const aria = tidy(el.getAttribute('aria-label') ?? '');
  if (aria !== '') return aria;

  return containerText(el.parentElement, [el], isCandidate, new Set());
}

export function groupLabel(
  members: readonly Element[],
  isCandidate: (other: Element) => boolean,
): string {
  const first = members[0];
  if (!first) return '';

  for (
    let cur = first.parentElement;
    cur && !isRoot(cur);
    cur = cur.parentElement
  ) {
    if (!cur.matches(GROUP_ANCESTOR)) continue;
    if (!members.every((m) => cur.contains(m))) continue;
    if (holdsOther(cur, members, isCandidate)) continue;
    const named = labelledBy(cur);
    if (named !== '') return named;
    const aria = tidy(cur.getAttribute('aria-label') ?? '');
    if (aria !== '') return aria;
    if (cur.localName === 'fieldset') {
      const legend = Array.from(cur.children).find(
        (child) => child.localName === 'legend',
      );
      const text = legend ? textOf(legend) : '';
      if (text !== '') return text;
    }
    break;
  }

  const left = new Set<Element>();
  for (const member of members) {
    const wrapping = member.closest('label');
    if (wrapping) left.add(wrapping);
    for (const label of labelsFor(member)) left.add(label);
  }
  return containerText(first.parentElement, members, isCandidate, left);
}
