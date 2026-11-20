// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';
import { applyWrites } from './page/apply';
import { scanForm, type PageScan } from './page/scan';

interface Loaded {
  window: Window;
  doc: Document;
  page: PageScan;
}

function parse(html: string): Loaded {
  const window = new Window({ url: 'https://example.com/jobs/1' });
  window.document.write(html);
  const doc = window.document as unknown as Document;
  return { window, doc, page: scanForm(doc) };
}

function load(name: string): Loaded {
  return parse(
    readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8'),
  );
}

function refOf(page: PageScan, label: RegExp): number {
  const field = page.scan.fields.find((f) => label.test(f.label));
  if (!field) throw new Error(`no field matches ${String(label)}`);
  return field.ref;
}

const WATCHED = [
  'input',
  'change',
  'keydown',
  'keyup',
  'click',
  'focus',
  'blur',
  'submit',
];

function record(doc: Document): Event[] {
  const events: Event[] = [];
  for (const type of WATCHED) {
    doc.addEventListener(type, (event) => events.push(event), {
      capture: true,
    });
  }
  return events;
}

function attributeMap(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('*')).map(
    (el) =>
      `${el.localName}|` +
      Array.from(el.attributes)
        .map((a) => `${a.name}=${a.value}`)
        .join(','),
  );
}

describe('applyWrites', () => {
  it('writes text, a select option and a checkbox', () => {
    const { doc, page } = load('lever-like.html');
    const name = refOf(page, /Full name/);
    const auth = refOf(page, /authorized/);
    const sponsor = refOf(page, /sponsorship/);
    const reports = applyWrites(page.elements, [
      { ref: name, kind: 'value', value: 'Sam Example' },
      { ref: auth, kind: 'option', index: 0 },
      { ref: sponsor, kind: 'option', index: 1 },
    ]);
    expect(reports).toEqual([
      { ref: name, outcome: 'written' },
      { ref: auth, outcome: 'written' },
      { ref: sponsor, outcome: 'written' },
    ]);
    expect((doc.querySelector('[name="name"]') as HTMLInputElement).value).toBe(
      'Sam Example',
    );
    const select = doc.querySelector('select') as HTMLSelectElement;
    expect(select.options[select.selectedIndex]?.text).toBe('Yes');
    const boxes = doc.querySelectorAll('[name="sponsorship"]');
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('fires input then change once per field', () => {
    const { doc, page } = load('lever-like.html');
    const events = record(doc);
    applyWrites(page.elements, [
      { ref: refOf(page, /Full name/), kind: 'value', value: 'Sam Example' },
      { ref: refOf(page, /authorized/), kind: 'option', index: 0 },
      { ref: refOf(page, /sponsorship/), kind: 'option', index: 1 },
    ]);
    expect(events.map((e) => e.type)).toEqual([
      'input',
      'change',
      'input',
      'change',
      'input',
      'change',
    ]);
    const targets = events.map((e) => e.target);
    expect(targets[0]).toBe(targets[1]);
    expect(targets[2]).toBe(targets[3]);
    expect(targets[4]).toBe(targets[5]);
    expect(targets[4]).toBe(doc.querySelectorAll('[name="sponsorship"]')[1]);
  });

  it('leaves a non-empty field alone', () => {
    const { doc, page } = load('prefilled.html');
    const events = record(doc);
    const email = refOf(page, /Email/);
    const select = refOf(page, /relocate/);
    const group = refOf(page, /over 18/);
    const reports = applyWrites(page.elements, [
      { ref: email, kind: 'value', value: 'other@example.com' },
      { ref: select, kind: 'option', index: 1 },
      { ref: group, kind: 'option', index: 0 },
    ]);
    expect(reports.map((r) => r.outcome)).toEqual([
      'not_empty',
      'not_empty',
      'not_empty',
    ]);
    expect((doc.querySelector('#email') as HTMLInputElement).value).toBe(
      'someone@example.com',
    );
    expect((doc.querySelector('#relocate') as HTMLSelectElement).value).toBe(
      'yes',
    );
    const radios = doc.querySelectorAll('[name="adult"]');
    expect((radios[0] as HTMLInputElement).checked).toBe(false);
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
    expect(events).toEqual([]);
  });

  it('treats a field holding only spaces as not empty', () => {
    const { doc, page } = load('lever-like.html');
    const name = refOf(page, /Full name/);
    (doc.querySelector('[name="name"]') as HTMLInputElement).value = '  ';
    const reports = applyWrites(page.elements, [
      { ref: name, kind: 'value', value: 'Sam Example' },
    ]);
    expect(reports).toEqual([{ ref: name, outcome: 'not_empty' }]);
  });

  it('a detached element is gone', () => {
    const { doc, page } = load('lever-like.html');
    const name = refOf(page, /Full name/);
    doc.querySelector('[name="name"]')?.remove();
    const reports = applyWrites(page.elements, [
      { ref: name, kind: 'value', value: 'Sam Example' },
      { ref: 999, kind: 'value', value: 'x' },
    ]);
    expect(reports).toEqual([
      { ref: name, outcome: 'gone' },
      { ref: 999, outcome: 'gone' },
    ]);
  });

  it('the page changed after the scan', () => {
    const { doc, page } = load('lever-like.html');
    const name = refOf(page, /Full name/);
    const input = doc.querySelector('[name="name"]') as HTMLInputElement;
    input.value = 'Typed by the visitor';
    const reports = applyWrites(page.elements, [
      { ref: name, kind: 'value', value: 'Sam Example' },
    ]);
    expect(reports).toEqual([{ ref: name, outcome: 'not_empty' }]);
    expect(input.value).toBe('Typed by the visitor');
  });

  it('wrong shapes fail', () => {
    const { doc, page } = load('lever-like.html');
    const events = record(doc);
    const before = attributeMap(doc);
    const name = refOf(page, /Full name/);
    const auth = refOf(page, /authorized/);
    const file = page.scan.fields.find((f) => f.control === 'file');
    const custom = page.scan.fields.find((f) => f.control === 'custom');
    expect(file).toBeDefined();
    expect(custom).toBeDefined();
    const writes = [
      { ref: name, kind: 'option', index: 0 },
      { ref: auth, kind: 'value', value: 'Yes' },
      { ref: auth, kind: 'option', index: 9 },
      { ref: name, kind: 'value', value: 'x'.repeat(501) },
      { ref: name, kind: 'value' },
      { ref: auth, kind: 'option', index: -1 },
      { ref: auth, kind: 'option', index: 1.5 },
      { ref: file?.ref ?? -1, kind: 'value', value: 'a' },
      { ref: custom?.ref ?? -1, kind: 'value', value: 'a' },
      { ref: name, kind: 'other' },
    ];
    const reports = applyWrites(page.elements, writes);
    expect(reports).toHaveLength(writes.length);
    expect(reports.every((r) => r.outcome === 'failed')).toBe(true);
    expect((doc.querySelector('[name="name"]') as HTMLInputElement).value).toBe(
      '',
    );
    expect((doc.querySelector('select') as HTMLSelectElement).value).toBe('');
    expect(events).toEqual([]);
    expect(attributeMap(doc)).toEqual(before);
  });

  it('fails a date that is not YYYY-MM-DD and writes one that is', () => {
    const { doc, page } = parse(
      '<form><label for="d">Start date</label><input id="d" type="date"></form>',
    );
    const ref = refOf(page, /Start date/);
    expect(page.scan.fields[0]?.control).toBe('date');
    expect(
      applyWrites(page.elements, [{ ref, kind: 'value', value: '12/01/2026' }]),
    ).toEqual([{ ref, outcome: 'failed' }]);
    expect(
      applyWrites(page.elements, [{ ref, kind: 'value', value: '2026-12-01' }]),
    ).toEqual([{ ref, outcome: 'written' }]);
    expect((doc.querySelector('#d') as HTMLInputElement).value).toBe(
      '2026-12-01',
    );
  });

  it('fails a field that became disabled or read-only after the scan', () => {
    const { doc, page } = parse(
      '<form>' +
        '<label for="a">Alpha</label><input id="a" type="text">' +
        '<label for="b">Bravo</label><input id="b" type="text">' +
        '<fieldset id="fs"><label for="c">Charlie</label>' +
        '<input id="c" type="text"></fieldset>' +
        '<label for="s">Sierra</label><select id="s">' +
        '<option value="">Choose</option><option value="x">X</option></select>' +
        '<fieldset><legend>Gamma</legend>' +
        '<label><input type="radio" name="g" value="1"> One</label>' +
        '<label><input type="radio" name="g" value="2"> Two</label>' +
        '</fieldset></form>',
    );
    const writes = [
      { ref: refOf(page, /Alpha/), kind: 'value', value: 'x' },
      { ref: refOf(page, /Bravo/), kind: 'value', value: 'x' },
      { ref: refOf(page, /Charlie/), kind: 'value', value: 'x' },
      { ref: refOf(page, /Sierra/), kind: 'option', index: 0 },
      { ref: refOf(page, /Gamma/), kind: 'option', index: 1 },
    ];
    doc.querySelector('#a')?.setAttribute('disabled', '');
    doc.querySelector('#b')?.setAttribute('readonly', '');
    doc.querySelector('#fs')?.setAttribute('disabled', '');
    doc.querySelector('#s')?.setAttribute('disabled', '');
    doc.querySelectorAll('[name="g"]')[1]?.setAttribute('disabled', '');
    const reports = applyWrites(page.elements, writes);
    expect(reports.map((r) => r.outcome)).toEqual([
      'failed',
      'failed',
      'failed',
      'failed',
      'failed',
    ]);
    for (const id of ['a', 'b', 'c']) {
      expect((doc.querySelector('#' + id) as HTMLInputElement).value).toBe('');
    }
    expect((doc.querySelector('#s') as HTMLSelectElement).value).toBe('');
    expect(
      (doc.querySelectorAll('[name="g"]')[1] as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('fails a field disabled after the scan', () => {
    const { doc, page } = load('lever-like.html');
    const name = refOf(page, /Full name/);
    doc.querySelector('[name="name"]')?.setAttribute('disabled', '');
    expect(
      applyWrites(page.elements, [{ ref: name, kind: 'value', value: 'x' }]),
    ).toEqual([{ ref: name, outcome: 'failed' }]);
  });

  it('hostile writes', () => {
    const { page } = load('lever-like.html');
    expect(applyWrites(page.elements, 'x')).toEqual([]);
    expect(applyWrites(page.elements, { length: 3 })).toEqual([]);
    expect(applyWrites(page.elements, null)).toEqual([]);
    const name = refOf(page, /Full name/);
    const many = Array.from({ length: 5000 }, () => ({
      ref: name,
      kind: 'value',
      value: 'x',
    }));
    expect(applyWrites(page.elements, many).length).toBeLessThanOrEqual(200);
    expect(
      applyWrites(page.elements, [null, 'x', [], { kind: 'value' }]),
    ).toEqual([]);
    expect(
      applyWrites(page.elements, [{ ref: 'a', kind: 'value', value: 'x' }]),
    ).toEqual([]);
  });

  it('reads at most 200 entries, counting skipped ones', () => {
    const { page } = load('lever-like.html');
    const name = refOf(page, /Full name/);
    const writes: unknown[] = Array.from({ length: 200 }, () => null);
    writes.push({ ref: name, kind: 'value', value: 'Sam Example' });
    expect(applyWrites(page.elements, writes)).toEqual([]);
  });

  it('goes through the prototype setter', () => {
    const { doc, window, page } = load('lever-like.html');
    const name = refOf(page, /Full name/);
    const input = doc.querySelector('[name="name"]') as HTMLInputElement;
    const calls: string[] = [];
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return '';
      },
      set(v: string) {
        calls.push(v);
      },
    });
    const reports = applyWrites(page.elements, [
      { ref: name, kind: 'value', value: 'Sam Example' },
    ]);
    expect(reports).toEqual([{ ref: name, outcome: 'written' }]);
    expect(calls).toEqual([]);
    // The getter is always called with .call on the element.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const get = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.get;
    expect(get?.call(input)).toBe('Sam Example');
  });

  it('behaviour guard: a full fill only sets values', () => {
    const { doc, window, page } = load('lever-like.html');
    const events = record(doc);
    const submit = vi.spyOn(window.HTMLFormElement.prototype, 'submit');
    const requestSubmit = vi.spyOn(
      window.HTMLFormElement.prototype,
      'requestSubmit',
    );
    const countBefore = doc.querySelectorAll('*').length;
    const attributesBefore = attributeMap(doc);
    const activeBefore = doc.activeElement;

    const reports = applyWrites(page.elements, [
      { ref: refOf(page, /Full name/), kind: 'value', value: 'Sam Example' },
      { ref: refOf(page, /Email/), kind: 'value', value: 'sam@example.com' },
      { ref: refOf(page, /Phone/), kind: 'value', value: '555-0100' },
      { ref: refOf(page, /authorized/), kind: 'option', index: 0 },
      { ref: refOf(page, /sponsorship/), kind: 'option', index: 1 },
      { ref: refOf(page, /Additional/), kind: 'value', value: 'Hello' },
    ]);

    expect(reports.every((r) => r.outcome === 'written')).toBe(true);
    expect(events.map((e) => e.type)).not.toContain('submit');
    for (const type of ['keydown', 'keyup', 'click', 'focus', 'blur']) {
      expect(events.map((e) => e.type)).not.toContain(type);
    }
    expect(submit).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(doc.querySelectorAll('*').length).toBe(countBefore);
    expect(attributeMap(doc)).toEqual(attributesBefore);
    expect(doc.activeElement).toBe(activeBefore);
  });
});
