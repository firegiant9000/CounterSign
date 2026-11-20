// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../core/src/fill/plan';
import { FRAME_HOSTS } from '../../core/src/fill/site';
import type { PlanInput } from '../../core/src/fill/types';
import { toFormScan } from '../../core/src/fill/validate';
import { scanForm } from './page/scan';

function parse(html: string): Document {
  const window = new Window({ url: 'https://example.com/jobs/1' });
  window.document.write(html);
  return window.document as unknown as Document;
}

function load(name: string): Document {
  return parse(
    readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8'),
  );
}

const FIXTURES = [
  'lever-like.html',
  'greenhouse-like.html',
  'autocomplete-only.html',
  'prefilled.html',
  'two-forms.html',
  'referee-block.html',
  'no-form.html',
  'embed-greenhouse.html',
  'embed-ashby.html',
];

describe('scanForm: lever-like', () => {
  const { scan } = scanForm(load('lever-like.html'));

  it('finds nine fields with the right controls', () => {
    expect(scan.fields.map((f) => f.control)).toEqual([
      'text',
      'text',
      'text',
      'custom',
      'text',
      'file',
      'select',
      'choice_group',
      'textarea',
    ]);
    expect(scan.frames).toEqual([]);
    expect(scan.truncated).toBe(false);
  });

  it('reads the labels', () => {
    expect(scan.fields.map((f) => f.label)).toEqual([
      'Full name',
      'Email',
      'Phone',
      'Current location',
      'LinkedIn URL',
      'Resume/CV',
      'Are you legally authorized to work in the United States?',
      'Will you now or in the future require visa sponsorship?',
      'Additional information',
    ]);
  });

  it('marks Full name required and nothing else', () => {
    expect(scan.fields.map((f) => f.required)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('reports the select without its placeholder', () => {
    const select = scan.fields[6];
    expect(select?.options).toEqual(['Yes', 'No']);
    expect(select?.value).toBe('');
    expect(select?.multiple).toBe(false);
  });

  it('reports the checkbox group', () => {
    const group = scan.fields[7];
    expect(group?.options).toEqual(['Yes', 'No']);
    expect(group?.checked).toEqual([]);
    expect(group?.multiple).toBe(true);
  });

  it('never reads the hidden input', () => {
    expect(JSON.stringify(scan)).not.toContain('hidden-token-7731');
  });
});

describe('scanForm: greenhouse-like', () => {
  const { scan } = scanForm(load('greenhouse-like.html'));

  it('finds nine fields', () => {
    expect(scan.fields).toHaveLength(9);
    expect(scan.fields.slice(0, 3).map((f) => f.autocomplete)).toEqual([
      'given-name',
      'family-name',
      'email',
    ]);
  });

  it('reads First Name as required', () => {
    const first = scan.fields[0];
    expect(['First Name *', 'First Name']).toContain(first?.label);
    expect(first?.required).toBe(true);
  });

  it('reports the comboboxes as custom with no value', () => {
    const custom = scan.fields.filter((f) => f.control === 'custom');
    expect(custom).toHaveLength(2);
    expect(custom.every((f) => f.value === '')).toBe(true);
    expect(scan.fields[7]?.control).toBe('custom');
    expect(scan.fields[8]?.control).toBe('custom');
  });

  it('skips the aria-hidden helpers and keeps the clipped file input', () => {
    expect(scan.fields.filter((f) => f.control === 'file')).toHaveLength(1);
    expect(scan.fields[4]?.control).toBe('file');
    expect(scan.fields).toHaveLength(9);
  });
});

describe('scanForm: autocomplete-only', () => {
  const { scan } = scanForm(load('autocomplete-only.html'));

  it('finds nine unlabelled fields', () => {
    expect(scan.fields).toHaveLength(9);
    expect(scan.fields.every((f) => f.label === '')).toBe(true);
    expect(scan.fields.map((f) => f.autocomplete)).toEqual([
      'name',
      'email',
      'tel',
      'address-line1',
      'address-level2',
      'address-level1',
      'postal-code',
      'country-name',
      'given-name',
    ]);
  });

  it('skips card, one-time code and password inputs', () => {
    const tokens = scan.fields.map((f) => f.autocomplete);
    expect(tokens).not.toContain('cc-number');
    expect(tokens).not.toContain('one-time-code');
    expect(tokens).not.toContain('current-password');
  });
});

describe('scanForm: prefilled', () => {
  const { scan } = scanForm(load('prefilled.html'));

  it('reads the values', () => {
    expect(scan.fields).toHaveLength(4);
    expect(scan.fields[0]?.value).toBe('someone@example.com');
    expect(scan.fields[1]?.value).toBe('555-0100');
    expect(scan.fields[2]?.control).toBe('select');
    expect(scan.fields[2]?.value).toBe('Yes');
  });

  it('reads the radio group', () => {
    const group = scan.fields[3];
    expect(group?.control).toBe('choice_group');
    expect(group?.options).toEqual(['Yes', 'No']);
    expect(group?.checked).toEqual([1]);
    expect(group?.multiple).toBe(false);
  });

  it('leaves out the read-only and disabled inputs', () => {
    const text = JSON.stringify(scan);
    expect(text).not.toContain('REF-1');
    expect(text).not.toContain('locked');
  });
});

describe('scanForm: elements line up', () => {
  it.each(FIXTURES)('%s', (name) => {
    const { scan, elements } = scanForm(load(name));
    expect(elements).toHaveLength(scan.fields.length);
    scan.fields.forEach((field, i) => {
      expect(field.ref).toBe(i);
      expect(elements[i]?.control).toBe(field.control);
      if (field.control === 'select' || field.control === 'choice_group') {
        expect(elements[i]?.options).toHaveLength(field.options.length);
      }
    });
  });

  it('keeps a select placeholder out of both lists', () => {
    const { scan, elements } = scanForm(load('lever-like.html'));
    expect(scan.fields[6]?.options).toEqual(['Yes', 'No']);
    expect(
      elements[6]?.options.map((o) => (o as HTMLOptionElement).text),
    ).toEqual(['Yes', 'No']);
  });

  it('puts the first group member in el', () => {
    const { elements } = scanForm(load('prefilled.html'));
    expect((elements[3]?.el as HTMLInputElement).value).toBe('yes');
  });
});

describe('scanForm: hidden fields', () => {
  it('skips fields hidden by an ancestor', () => {
    const doc = parse(`<form>
      <div hidden><input type="text" aria-label="One" /></div>
      <div aria-hidden="true"><input type="text" aria-label="Two" /></div>
      <div style="display:none"><input type="text" aria-label="Three" /></div>
      <div style="visibility:hidden"><input type="text" aria-label="Four" /></div>
      <div inert><input type="text" aria-label="Five" /></div>
      <input type="text" aria-label="Six" />
    </form>`);
    expect(scanForm(doc).scan.fields.map((f) => f.label)).toEqual(['Six']);
  });

  it('keeps a file input that is hidden by display', () => {
    const doc = parse(
      '<form><input type="file" style="display:none" aria-label="Resume" /></form>',
    );
    const { scan } = scanForm(doc);
    expect(scan.fields).toHaveLength(1);
    expect(scan.fields[0]?.control).toBe('file');
  });
});

describe('scanForm: candidates and control', () => {
  it('uses an allow list of input types', () => {
    const doc = parse(`<form>
      <input aria-label="a" />
      <input type="" aria-label="b" />
      <input type="TEXT" aria-label="c" />
      <input type="date" aria-label="d" />
      <input type="number" aria-label="e" />
      <input type="url" aria-label="f" />
      <input type="range" aria-label="g" />
      <input type="color" aria-label="h" />
      <input type="hidden" aria-label="i" value="x" />
    </form>`);
    const { scan } = scanForm(doc);
    expect(scan.fields.map((f) => f.label)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
    expect(scan.fields[3]?.control).toBe('date');
  });

  it('treats aria-haspopup, aria-autocomplete and role as custom', () => {
    const doc = parse(`<form>
      <input aria-label="a" aria-haspopup="listbox" />
      <input aria-label="b" aria-haspopup="false" />
      <input aria-label="c" aria-autocomplete="none" />
      <input aria-label="d" aria-autocomplete="both" />
      <input aria-label="e" role="combobox" />
    </form>`);
    expect(scanForm(doc).scan.fields.map((f) => f.control)).toEqual([
      'custom',
      'text',
      'text',
      'custom',
      'custom',
    ]);
  });

  it('skips a field in a disabled fieldset', () => {
    const doc = parse(
      '<form><fieldset disabled><input aria-label="a" /></fieldset><input aria-label="b" /></form>',
    );
    expect(scanForm(doc).scan.fields.map((f) => f.label)).toEqual(['b']);
  });

  it('skips new-password and cc- autocomplete, keeps the rest', () => {
    const doc = parse(`<form>
      <input aria-label="a" autocomplete="new-password" />
      <input aria-label="b" autocomplete="cc-exp" />
      <input aria-label="c" autocomplete="section-x cc-name" />
      <input aria-label="d" autocomplete="off" />
    </form>`);
    const { scan } = scanForm(doc);
    expect(scan.fields.map((f) => f.label)).toEqual(['d']);
    expect(scan.fields[0]?.autocomplete).toBe('off');
  });

  it('reads aria-required and trims values', () => {
    const doc = parse(
      '<form><input aria-label="a" aria-required="true" value="  hi  " /><input aria-label="b" value="   " /></form>',
    );
    const { scan } = scanForm(doc);
    expect(scan.fields[0]?.required).toBe(true);
    expect(scan.fields[0]?.value).toBe('hi');
    expect(scan.fields[1]?.value).toBe('');
  });

  it('reads a multi-select and a checked group of one', () => {
    const doc = parse(`<form>
      <select multiple aria-label="m"><option>A</option><option selected>B</option></select>
      <label><input type="checkbox" checked /> Agree</label>
    </form>`);
    const { scan } = scanForm(doc);
    expect(scan.fields[0]?.multiple).toBe(true);
    expect(scan.fields[1]?.control).toBe('choice_group');
    expect(scan.fields[1]?.options).toEqual(['Agree']);
    expect(scan.fields[1]?.checked).toEqual([0]);
  });

  it('falls back to the value attribute for an option label', () => {
    const doc = parse(
      '<form><input type="radio" name="r" value="alpha" /><input type="radio" name="r" value="beta" /></form>',
    );
    expect(scanForm(doc).scan.fields[0]?.options).toEqual(['alpha', 'beta']);
  });

  it('gives a select with only a placeholder chosen an empty value', () => {
    const doc = parse(
      '<form><select aria-label="s"><option value="">Choose one</option><option value="a">Alpha</option></select></form>',
    );
    expect(scanForm(doc).scan.fields[0]?.value).toBe('');
  });
});

describe('scanForm: caps', () => {
  it('stops at 200 fields', () => {
    const inputs = Array.from(
      { length: 250 },
      (_, i) => `<input type="text" aria-label="f${i}" />`,
    ).join('');
    const { scan, elements } = scanForm(parse(`<form>${inputs}</form>`));
    expect(scan.fields).toHaveLength(200);
    expect(elements).toHaveLength(200);
    expect(scan.truncated).toBe(true);
  });

  it('is not truncated at exactly 200 fields', () => {
    const inputs = Array.from(
      { length: 200 },
      (_, i) => `<input type="text" aria-label="f${i}" />`,
    ).join('');
    expect(scanForm(parse(`<form>${inputs}</form>`)).scan.truncated).toBe(
      false,
    );
  });

  it('cuts a select at 50 options in both lists', () => {
    const options = Array.from(
      { length: 80 },
      (_, i) => `<option value="v${i}">Option ${i}</option>`,
    ).join('');
    const { scan, elements } = scanForm(
      parse(`<form><select aria-label="s">${options}</select></form>`),
    );
    expect(scan.fields[0]?.options).toHaveLength(50);
    expect(elements[0]?.options).toHaveLength(50);
    expect(scan.fields[0]?.optionsTruncated).toBe(true);
  });

  it('cuts long values at 500 characters', () => {
    const doc = parse(
      `<form><input aria-label="a" value="${'x'.repeat(600)}" /></form>`,
    );
    expect(scanForm(doc).scan.fields[0]?.value).toHaveLength(500);
  });
});

const GREENHOUSE_SRC =
  'https://job-boards.greenhouse.io/embed/job_app?for=exampleco&token=1234567&validityToken=abc';

describe('scanForm: the form choice', () => {
  it('scans the application form and ignores the newsletter box', () => {
    const { scan, elements } = scanForm(load('two-forms.html'));
    expect(scan.fields).toHaveLength(4);
    expect(elements).toHaveLength(4);
    expect(scan.fields.filter((f) => f.label === 'Email')).toHaveLength(1);
  });

  it('picks the first form on a tie', () => {
    const doc = parse(`<form>
      <input aria-label="A1" /><input aria-label="A2" />
    </form><form>
      <input aria-label="B1" /><input aria-label="B2" />
    </form>`);
    expect(scanForm(doc).scan.fields.map((f) => f.label)).toEqual(['A1', 'A2']);
  });

  it('scans the whole document when there is no form', () => {
    const doc = parse(
      '<div><input aria-label="A" /><input aria-label="B" /></div>',
    );
    expect(scanForm(doc).scan.fields.map((f) => f.label)).toEqual(['A', 'B']);
  });

  it('finds nothing on a posting page with only a search box', () => {
    const { scan } = scanForm(load('no-form.html'));
    expect(scan.fields).toEqual([]);
    expect(scan.frames).toEqual([]);
  });

  it('forms a group only from members inside the chosen form', () => {
    const doc = parse(`<form>
      <input aria-label="A" /><input aria-label="B" />
      <input type="radio" name="r" value="x" /><input type="radio" name="r" value="y" />
    </form><form><input type="radio" name="r" value="z" /></form>`);
    const { scan } = scanForm(doc);
    expect(scan.fields).toHaveLength(3);
    expect(scan.fields[2]?.options).toEqual(['x', 'y']);
  });

  it('plans the referee block as four ambiguous rows', () => {
    const sam: PlanInput = {
      profile: { full_name: 'Sam Example', email: 'sam@example.com' },
      answers: [],
    };
    const { scan } = scanForm(load('referee-block.html'));
    expect(scan.fields.map((f) => f.label)).toEqual([
      'Name',
      'Email',
      'Name',
      'Email',
    ]);
    const plan = buildPlan(scan, sam);
    expect(plan.rows).toHaveLength(4);
    for (const row of plan.rows) {
      expect(row.status).toBe('not_filled');
      expect(row.reason).toBe('ambiguous');
    }
    expect(plan.writes).toEqual([]);
  });
});

describe('scanForm: frames', () => {
  it('reports the Greenhouse embed and no fields', () => {
    const { scan } = scanForm(load('embed-greenhouse.html'));
    expect(scan.frames).toEqual([GREENHOUSE_SRC]);
    expect(scan.fields).toEqual([]);
  });

  it('reports the Ashby embed', () => {
    const { scan } = scanForm(load('embed-ashby.html'));
    expect(scan.frames).toEqual([
      'https://jobs.ashbyhq.com/exampleco/0000?embed=js',
    ]);
  });

  it('reports every known frame host', () => {
    const frames = Array.from(FRAME_HOSTS.keys()).map(
      (host) => `<iframe src="https://${host}/x"></iframe>`,
    );
    const { scan } = scanForm(parse(frames.join('')));
    expect(scan.frames).toHaveLength(FRAME_HOSTS.size);
  });

  it('stops at five frames', () => {
    const frames = Array.from(
      { length: 6 },
      (_, i) => `<iframe src="${GREENHOUSE_SRC}&n=${i}"></iframe>`,
    ).join('');
    expect(scanForm(parse(frames)).scan.frames).toHaveLength(5);
  });

  it('resolves a relative src and skips other protocols and no src', () => {
    const doc = parse(`
      <iframe src="//boards.greenhouse.io/embed/job_app?for=a"></iframe>
      <iframe src="http://boards.greenhouse.io/embed/job_app?for=b"></iframe>
      <iframe src="/local/page"></iframe>
      <iframe></iframe>`);
    expect(scanForm(doc).scan.frames).toEqual([
      'https://boards.greenhouse.io/embed/job_app?for=a',
    ]);
  });

  it('cuts a long src at 2,000 characters', () => {
    const doc = parse(
      `<iframe src="https://boards.greenhouse.io/x?q=${'a'.repeat(2500)}"></iframe>`,
    );
    expect(scanForm(doc).scan.frames[0]).toHaveLength(2000);
  });

  it('finds frames outside the chosen form', () => {
    const doc = parse(
      `<form><input aria-label="A" /></form><iframe src="${GREENHOUSE_SRC}"></iframe>`,
    );
    expect(scanForm(doc).scan.frames).toEqual([GREENHOUSE_SRC]);
  });
});

function labels(html: string): string[] {
  return scanForm(parse(`<form>${html}</form>`)).scan.fields.map(
    (f) => f.label,
  );
}

describe('scanForm: fix round 1, skips', () => {
  it('skips when any autocomplete token is blocked', () => {
    expect(
      labels(`
      <input aria-label="a" autocomplete="current-password webauthn" />
      <input aria-label="b" autocomplete="section-a cc-number webauthn" />
      <input aria-label="c" autocomplete="ONE-TIME-CODE" />
      <input aria-label="d" autocomplete="new-password webauthn" />
      <input aria-label="e" autocomplete="section-a shipping given-name" />`),
    ).toEqual(['e']);
  });

  it('still reports the last token as autocomplete', () => {
    const doc = parse(
      '<form><input aria-label="a" autocomplete="Section-A Shipping Given-Name" /></form>',
    );
    expect(scanForm(doc).scan.fields[0]?.autocomplete).toBe('given-name');
  });

  it('skips aria-hidden in any case or padding', () => {
    expect(
      labels(`
      <input aria-label="a" aria-hidden="True" />
      <input aria-label="b" aria-hidden=" TRUE " />
      <input aria-label="c" aria-hidden="false" />`),
    ).toEqual(['c']);
  });

  it('reads role tokens for combobox', () => {
    const doc = parse(`<form>
      <input aria-label="a" role="search combobox" />
      <input aria-label="b" role="Combobox" />
      <input aria-label="c" role="searchbox" />
    </form>`);
    expect(scanForm(doc).scan.fields.map((f) => f.control)).toEqual([
      'custom',
      'custom',
      'text',
    ]);
  });

  it('leaves out inputs of types the allow list lacks', () => {
    expect(
      labels(`
      <input type="password" aria-label="a" />
      <input type="submit" aria-label="b" value="Go" />
      <input type="button" aria-label="c" value="Go" />
      <input type="image" aria-label="d" />
      <input type="reset" aria-label="e" />
      <input type="search" aria-label="f" />
      <input type="text" aria-label="g" />`),
    ).toEqual(['g']);
  });

  it('does not trim the type attribute', () => {
    expect(
      labels(`
      <input type=" radio" name="r" aria-label="a" />
      <input type=" password" aria-label="b" />
      <input type="text" aria-label="c" />`),
    ).toEqual(['c']);
  });

  it('keeps a file input under a display:none ancestor', () => {
    const { scan } = scanForm(
      parse(
        '<form><div style="display:none"><input type="file" aria-label="Resume" /></div></form>',
      ),
    );
    expect(scan.fields.map((f) => f.control)).toEqual(['file']);
  });
});

describe('scanForm: fix round 1, defaults', () => {
  it('pins values for custom, file and date', () => {
    const { scan } = scanForm(
      parse(`<form>
        <input role="combobox" aria-label="a" value="typed" />
        <input type="file" aria-label="b" />
        <input type="date" aria-label="c" value="2026-12-01" />
      </form>`),
    );
    expect(scan.fields.map((f) => [f.control, f.value])).toEqual([
      ['custom', ''],
      ['file', ''],
      ['date', '2026-12-01'],
    ]);
    expect(toFormScan(scan)).toEqual(scan);
  });

  it('trims again after cutting a value', () => {
    const value = `${'x'.repeat(499)} y`;
    const { scan } = scanForm(
      parse(`<form><input aria-label="a" value="${value}" /></form>`),
    );
    expect(scan.fields[0]?.value).toBe('x'.repeat(499));
    expect(toFormScan(scan)).toEqual(scan);
  });
});

describe('scanForm: fix round 1, groups and options', () => {
  it('cuts a 60 member checkbox group at 50', () => {
    const members = Array.from(
      { length: 60 },
      (_, i) => `<input type="checkbox" name="g" value="v${i}" />`,
    ).join('');
    const { scan, elements } = scanForm(parse(`<form>${members}</form>`));
    expect(scan.fields).toHaveLength(1);
    expect(scan.fields[0]?.options).toHaveLength(50);
    expect(scan.fields[0]?.optionsTruncated).toBe(true);
    expect(elements[0]?.options).toHaveLength(50);
    expect(toFormScan(scan)).toEqual(scan);
  });

  it('lists every checked radio', () => {
    const { scan } = scanForm(
      parse(`<form>
        <input type="radio" name="r" value="a" checked />
        <input type="radio" name="r" value="b" />
        <input type="radio" name="r" value="c" checked />
      </form>`),
    );
    expect(scan.fields[0]?.checked).toEqual([0, 2]);
  });

  it('makes two groups of a radio and a checkbox sharing a name', () => {
    const { scan } = scanForm(
      parse(`<form>
        <input type="radio" name="x" value="a" />
        <input type="checkbox" name="x" value="b" />
        <input type="radio" name="x" value="c" />
      </form>`),
    );
    expect(scan.fields).toHaveLength(2);
    expect(scan.fields.map((f) => f.options)).toEqual([['a', 'c'], ['b']]);
    expect(scan.fields.map((f) => f.multiple)).toEqual([false, true]);
  });

  it('leaves a disabled member out of the options', () => {
    const { scan, elements } = scanForm(
      parse(`<form>
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" disabled />
        <input type="radio" name="r" value="c" />
      </form>`),
    );
    expect(scan.fields[0]?.options).toEqual(['a', 'c']);
    expect(elements[0]?.options).toHaveLength(2);
  });

  it('requires the group when any member is required', () => {
    const { scan } = scanForm(
      parse(`<form>
        <input type="checkbox" name="c" value="a" />
        <input type="checkbox" name="c" value="b" required />
      </form>`),
    );
    expect(scan.fields[0]?.required).toBe(true);
  });

  it('cuts a select with a placeholder and 60 options at 50', () => {
    const options = Array.from(
      { length: 60 },
      (_, i) => `<option value="v${i}">Option ${i}</option>`,
    ).join('');
    const { scan, elements } = scanForm(
      parse(
        `<form><select aria-label="s"><option value="">Choose</option>${options}</select></form>`,
      ),
    );
    const field = scan.fields[0];
    expect(field?.options).toHaveLength(50);
    expect(field?.options[0]).toBe('Option 0');
    expect(field?.optionsTruncated).toBe(true);
    expect(elements[0]?.options).toHaveLength(50);
  });

  it('leaves disabled options and disabled optgroups out of both lists', () => {
    const { scan, elements } = scanForm(
      parse(`<form><select aria-label="s">
        <option value="">Choose</option>
        <option value="a">Alpha</option>
        <option value="b" disabled>Beta</option>
        <optgroup label="g" disabled><option value="c">Gamma</option></optgroup>
        <optgroup label="h"><option value="d">Delta</option></optgroup>
      </select></form>`),
    );
    expect(scan.fields[0]?.options).toEqual(['Alpha', 'Delta']);
    expect(
      elements[0]?.options.map((o) => (o as HTMLOptionElement).text),
    ).toEqual(['Alpha', 'Delta']);
  });
});

describe('scanForm: validation', () => {
  it.each(FIXTURES)('%s passes toFormScan unchanged', (name) => {
    const { scan } = scanForm(load(name));
    expect(toFormScan(scan)).toEqual(scan);
  });
});

describe('scanForm: visually hidden fields', () => {
  function count(html: string): number {
    return scanForm(parse(`<form>${html}</form>`)).scan.fields.length;
  }

  function stubBox(
    doc: Document,
    selector: string,
    box: Partial<DOMRect>,
  ): void {
    const el = doc.querySelector(selector) as Element;
    const full = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      ...box,
    };
    el.getBoundingClientRect = () => full as DOMRect;
  }

  it('keeps an ordinary field', () => {
    expect(count('<input type="text" name="a" />')).toBe(1);
  });

  it('skips opacity:0 on the field', () => {
    expect(count('<input type="text" style="opacity:0" />')).toBe(0);
  });

  it('skips opacity:0 on an ancestor', () => {
    expect(count('<div style="opacity:0"><textarea></textarea></div>')).toBe(0);
  });

  it.each([
    'clip: rect(0px, 0px, 0px, 0px)',
    'clip: rect(1px, 1px, 1px, 1px)',
    'clip-path: inset(50%)',
    'clip-path: inset(100%)',
  ])('skips %s', (style) => {
    expect(count(`<input type="text" style="${style}" />`)).toBe(0);
  });

  it('skips a field with a 1px computed size', () => {
    expect(count('<input type="text" style="width:1px;height:1px" />')).toBe(0);
  });

  it('skips a select that is opacity:0', () => {
    expect(count('<select style="opacity:0"><option>a</option></select>')).toBe(
      0,
    );
  });

  it('skips a tiny laid-out box', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    stubBox(doc, '#t', {
      left: 10,
      top: 10,
      right: 11,
      bottom: 30,
      width: 1,
      height: 20,
    });
    expect(scanForm(doc).scan.fields).toHaveLength(0);
  });

  it('skips a box left of the page', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    stubBox(doc, '#t', {
      left: -10200,
      top: 10,
      right: -10000,
      bottom: 30,
      width: 200,
      height: 20,
    });
    expect(scanForm(doc).scan.fields).toHaveLength(0);
  });

  it('skips a box above the page', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    stubBox(doc, '#t', {
      left: 10,
      top: -5000,
      right: 210,
      bottom: -4980,
      width: 200,
      height: 20,
    });
    expect(scanForm(doc).scan.fields).toHaveLength(0);
  });

  it('keeps a normal laid-out box', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    stubBox(doc, '#t', {
      left: 10,
      top: 10,
      right: 210,
      bottom: 30,
      width: 200,
      height: 20,
    });
    expect(scanForm(doc).scan.fields).toHaveLength(1);
  });

  it('still scans a radio group with opacity:0 members', () => {
    const { scan } = scanForm(
      parse(`<form>
        <input type="radio" name="r" value="a" style="opacity:0" />
        <input type="radio" name="r" value="b" style="opacity:0" />
      </form>`),
    );
    expect(scan.fields).toHaveLength(1);
    expect(scan.fields[0]?.options).toEqual(['a', 'b']);
  });
});

describe('scanForm: a checked radio that is not a candidate', () => {
  function outcome(hiddenMember: string): number {
    const { scan, elements } = scanForm(
      parse(`<form>
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" />
        ${hiddenMember}
      </form>`),
    );
    expect(elements).toHaveLength(scan.fields.length);
    return scan.fields.length;
  }

  it('leaves the group out when a disabled member is checked', () => {
    expect(
      outcome('<input type="radio" name="r" value="c" disabled checked />'),
    ).toBe(0);
  });

  it('leaves the group out when a display:none member is checked', () => {
    expect(
      outcome(
        '<input type="radio" name="r" value="c" style="display:none" checked />',
      ),
    ).toBe(0);
  });

  it('leaves the group out when a readonly member is checked', () => {
    expect(
      outcome('<input type="radio" name="r" value="c" readonly checked />'),
    ).toBe(0);
  });

  it('keeps the group when the non-candidate member is unchecked', () => {
    expect(outcome('<input type="radio" name="r" value="c" disabled />')).toBe(
      1,
    );
  });

  it('ignores a checked radio of the same name in another form', () => {
    const { scan } = scanForm(
      parse(`<form>
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" />
      </form><form><input type="radio" name="r" value="c" disabled checked /></form>`),
    );
    expect(scan.fields).toHaveLength(1);
  });

  it('produces no write in the plan', () => {
    const { scan } = scanForm(
      parse(`<form>
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" />
        <input type="radio" name="r" value="c" disabled checked />
      </form>`),
    );
    expect(scan.fields.some((f) => f.control === 'choice_group')).toBe(false);
  });
});

describe('scanForm: fix round 1, parents, unrendered fields, form owners', () => {
  type Box = Partial<DOMRect>;
  const rectOf = (box: Box): DOMRect =>
    ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      ...box,
    }) as DOMRect;

  function stubBox(doc: Document, selector: string, box: Box): void {
    const el = doc.querySelector(selector) as Element;
    el.getBoundingClientRect = () => rectOf(box);
  }

  function fieldCount(doc: Document): number {
    return scanForm(doc).scan.fields.length;
  }

  it('skips a field in an sr-only wrapper', () => {
    const doc = parse(
      `<form><div style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0px,0px,0px,0px)"><input type="text" name="website" /></div></form>`,
    );
    expect(fieldCount(doc)).toBe(0);
  });

  it('skips a field in a collapsed accordion', () => {
    const doc = parse(
      `<form><div style="height:0;overflow:hidden"><input type="text" name="a" /></div></form>`,
    );
    expect(fieldCount(doc)).toBe(0);
  });

  it('skips a field in a laid-out wrapper of 1px that clips', () => {
    const doc = parse(
      `<form><div id="w" style="overflow:hidden"><input type="text" id="t" /></div></form>`,
    );
    stubBox(doc, '#w', {
      left: 5,
      top: 5,
      right: 205,
      bottom: 5,
      width: 200,
      height: 0,
    });
    stubBox(doc, '#t', {
      left: 5,
      top: 5,
      right: 205,
      bottom: 25,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(0);
  });

  it('keeps a field in a small wrapper that does not clip', () => {
    const doc = parse(
      `<form><div style="height:0"><input type="text" name="a" /></div></form>`,
    );
    expect(fieldCount(doc)).toBe(1);
  });

  it('skips a field when checkVisibility says it is not visible', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    (
      doc.querySelector('#t') as unknown as { checkVisibility: () => boolean }
    ).checkVisibility = () => false;
    expect(fieldCount(doc)).toBe(0);
  });

  it('skips a field with no client rects when checkVisibility exists', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    const el = doc.querySelector('#t') as unknown as {
      checkVisibility: () => boolean;
      getClientRects: () => unknown[];
    };
    el.checkVisibility = () => true;
    el.getClientRects = () => [];
    expect(fieldCount(doc)).toBe(0);
  });

  it('skips a text field inside a closed details when it is unrendered', () => {
    const doc = parse(
      '<form><details><summary>s</summary><input type="text" id="t" /></details></form>',
    );
    const el = doc.querySelector('#t') as unknown as {
      checkVisibility: () => boolean;
    };
    el.checkVisibility = () => false;
    expect(fieldCount(doc)).toBe(0);
  });

  it('asks checkVisibility without opacityProperty for a radio, and skips it when unrendered', () => {
    const doc = parse(
      '<form><input type="radio" name="r" id="t" value="a" style="opacity:0" /></form>',
    );
    const el = doc.querySelector('#t') as unknown as {
      checkVisibility: (o: Record<string, boolean>) => boolean;
    };
    let seen: Record<string, boolean> = {};
    el.checkVisibility = (o) => {
      seen = o;
      return false;
    };
    expect(fieldCount(doc)).toBe(0);
    expect(seen.opacityProperty).toBeUndefined();
    expect(seen).not.toHaveProperty('contentVisibilityAuto');
  });

  it('does not pass contentVisibilityAuto to checkVisibility for a text field', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    const el = doc.querySelector('#t') as unknown as {
      checkVisibility: (o: Record<string, boolean>) => boolean;
    };
    let seen: Record<string, boolean> | undefined;
    el.checkVisibility = (o) => {
      seen = o;
      return true;
    };
    expect(fieldCount(doc)).toBe(1);
    expect(seen).toBeDefined();
    expect(seen).not.toHaveProperty('contentVisibilityAuto');
  });

  it('keeps a field when body clips overflow and has a zero-height rect', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    doc.body.style.overflowX = 'hidden';
    stubBox(doc, 'body', {
      left: 0,
      top: 0,
      right: 800,
      bottom: 0,
      width: 800,
      height: 0,
    });
    stubBox(doc, '#t', {
      left: 10,
      top: 10,
      right: 210,
      bottom: 30,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(1);
  });

  it('keeps a field inside an inline span with overflow hidden', () => {
    const doc = parse(
      '<form><span id="w" style="display:inline;overflow:hidden"><input type="text" id="t" /></span></form>',
    );
    stubBox(doc, '#w', {
      left: 10,
      top: 10,
      right: 10,
      bottom: 10,
      width: 0,
      height: 0,
    });
    stubBox(doc, '#t', {
      left: 10,
      top: 10,
      right: 210,
      bottom: 30,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(1);
  });

  it('skips a laid-out field in a 0x0 clipping wrapper at the page origin', () => {
    // A real 0x0 box at the origin reads all zero, like happy-dom's no-layout box.
    const doc = parse(
      '<form><div id="w" style="overflow:hidden"><input type="text" id="t" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
    stubBox(doc, '#t', {
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(0);
  });

  it('keeps a field scrolled out of view inside a scrolling box', () => {
    const doc = parse(
      '<form><div id="w" style="overflow-y:auto"><input type="text" id="t" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 0,
      top: 100,
      right: 400,
      bottom: 500,
      width: 400,
      height: 400,
    });
    stubBox(doc, '#t', {
      left: 10,
      top: 700,
      right: 210,
      bottom: 720,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(1);
  });

  it('keeps a positioned field that sits outside a large clipping wrapper', () => {
    const doc = parse(
      '<form><div id="w" style="overflow:hidden"><input type="text" id="t" style="position:absolute" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 0,
      top: 100,
      right: 400,
      bottom: 300,
      width: 400,
      height: 200,
    });
    stubBox(doc, '#t', {
      left: 10,
      top: 400,
      right: 210,
      bottom: 420,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(1);
  });

  it('skips a field pushed outside a large overflow:hidden wrapper', () => {
    const doc = parse(
      '<form><div id="w" style="overflow:hidden"><input type="text" id="t" style="margin-top:200px" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 0,
      top: 100,
      right: 300,
      bottom: 130,
      width: 300,
      height: 30,
    });
    stubBox(doc, '#t', {
      left: 0,
      top: 300,
      right: 200,
      bottom: 320,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(0);
  });

  it('skips an absolute field pushed outside its positioned clipping wrapper', () => {
    const doc = parse(
      '<form><div id="w" style="position:relative;overflow:hidden"><input type="text" id="t" style="position:absolute" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 0,
      top: 100,
      right: 300,
      bottom: 130,
      width: 300,
      height: 30,
    });
    stubBox(doc, '#t', {
      left: 0,
      top: 300,
      right: 200,
      bottom: 320,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(0);
  });

  it('skips an absolute field clipped by a positioned grandparent it escapes to', () => {
    const doc = parse(
      '<form><div id="g" style="position:relative;overflow:hidden"><div id="w"><input type="text" id="t" style="position:absolute" /></div></div></form>',
    );
    stubBox(doc, '#g', {
      left: 0,
      top: 100,
      right: 300,
      bottom: 130,
      width: 300,
      height: 30,
    });
    stubBox(doc, '#t', {
      left: 0,
      top: 300,
      right: 200,
      bottom: 320,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(0);
  });

  it('keeps an absolute field that escapes a tiny wrapper which is not its containing block', () => {
    const doc = parse(
      '<form><div id="w" style="overflow:hidden"><input type="text" id="t" style="position:absolute" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 0,
      top: 100,
      right: 300,
      bottom: 100,
      width: 300,
      height: 0,
    });
    stubBox(doc, '#t', {
      left: 0,
      top: 100,
      right: 200,
      bottom: 120,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(1);
  });

  it('skips a field in a laid-out 1px clipping wrapper away from it', () => {
    const doc = parse(
      '<form><div id="w" style="overflow:hidden"><input type="text" id="t" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
      width: 1,
      height: 1,
    });
    stubBox(doc, '#t', {
      left: 50,
      top: 50,
      right: 250,
      bottom: 70,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(0);
  });

  it('keeps a field when a laid-out clipping wrapper intersects it', () => {
    const doc = parse(
      '<form><div id="w" style="overflow:hidden"><input type="text" id="t" /></div></form>',
    );
    stubBox(doc, '#w', {
      left: 40,
      top: 40,
      right: 300,
      bottom: 100,
      width: 260,
      height: 60,
    });
    stubBox(doc, '#t', {
      left: 50,
      top: 50,
      right: 250,
      bottom: 70,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(1);
  });

  it('judges the horizontal edge on a right-to-left page', () => {
    const make = (left: number) => {
      const doc = parse('<form><input type="text" id="t" /></form>');
      doc.documentElement.style.direction = 'rtl';
      Object.defineProperty(doc.documentElement, 'clientWidth', {
        value: 1000,
        configurable: true,
      });
      Object.defineProperty(doc.defaultView, 'scrollX', {
        value: -200,
        configurable: true,
      });
      stubBox(doc, '#t', {
        left,
        top: 10,
        right: left + 200,
        bottom: 30,
        width: 200,
        height: 20,
      });
      return doc;
    };
    // Page x = left + scrollX; the document's right edge is at clientWidth.
    expect(fieldCount(make(900))).toBe(1);
    expect(fieldCount(make(1300))).toBe(0);
  });

  it('keeps two same-name radios apart when one belongs to another form by attribute', () => {
    const doc = parse(
      `<form id="f1">
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" form="f2" />
      </form><form id="f2"></form>`,
    );
    expect(fieldCount(doc)).toBe(2);
  });

  it('is not blocked by a checked disabled peer when form points at no form', () => {
    const doc = parse(
      `<form>
        <input type="radio" name="r" value="a" form="nope" />
        <input type="radio" name="r" value="b" form="nope" />
        <input type="radio" name="r" value="c" disabled checked />
      </form>`,
    );
    expect(fieldCount(doc)).toBe(1);
  });

  it.each([
    'inset(0px 50%)',
    'inset(0px 0px 100% 0px)',
    'inset(50% 0px 50% 0px)',
  ])('skips clip-path %s', (path) => {
    const doc = parse(
      `<form><input type="text" style="clip-path:${path}" /></form>`,
    );
    expect(fieldCount(doc)).toBe(0);
  });

  it('keeps a small clip-path inset', () => {
    const doc = parse(
      '<form><input type="text" style="clip-path:inset(10% 0px)" /></form>',
    );
    expect(fieldCount(doc)).toBe(1);
  });

  it('keeps a box left of the page on a right-to-left page', () => {
    const doc = parse('<form><input type="text" id="t" /></form>');
    doc.documentElement.style.direction = 'rtl';
    stubBox(doc, '#t', {
      left: -300,
      top: 10,
      right: -100,
      bottom: 30,
      width: 200,
      height: 20,
    });
    expect(fieldCount(doc)).toBe(1);
  });

  it('adds scrollY before judging a box above the page', () => {
    const kept = parse('<form><input type="text" id="t" /></form>');
    Object.defineProperty(kept.defaultView, 'scrollY', {
      value: 300,
      configurable: true,
    });
    stubBox(kept, '#t', {
      left: 10,
      top: -200,
      right: 210,
      bottom: -180,
      width: 200,
      height: 20,
    });
    expect(fieldCount(kept)).toBe(1);
    const near = parse('<form><input type="text" id="t" /></form>');
    Object.defineProperty(near.defaultView, 'scrollY', {
      value: 300,
      configurable: true,
    });
    stubBox(near, '#t', {
      left: 10,
      top: -350,
      right: 210,
      bottom: -320,
      width: 200,
      height: 30,
    });
    expect(fieldCount(near)).toBe(0);
    const skipped = parse('<form><input type="text" id="t" /></form>');
    Object.defineProperty(skipped.defaultView, 'scrollY', {
      value: 300,
      configurable: true,
    });
    stubBox(skipped, '#t', {
      left: 10,
      top: -420,
      right: 210,
      bottom: -400,
      width: 200,
      height: 20,
    });
    expect(fieldCount(skipped)).toBe(0);
  });

  it('adds scrollX before judging a box left of the page', () => {
    const kept = parse('<form><input type="text" id="t" /></form>');
    Object.defineProperty(kept.defaultView, 'scrollX', {
      value: 300,
      configurable: true,
    });
    stubBox(kept, '#t', {
      left: -400,
      top: 10,
      right: -200,
      bottom: 30,
      width: 200,
      height: 20,
    });
    expect(fieldCount(kept)).toBe(1);
    const skipped = parse('<form><input type="text" id="t" /></form>');
    Object.defineProperty(skipped.defaultView, 'scrollX', {
      value: 300,
      configurable: true,
    });
    stubBox(skipped, '#t', {
      left: -600,
      top: 10,
      right: -400,
      bottom: 30,
      width: 200,
      height: 20,
    });
    expect(fieldCount(skipped)).toBe(0);
  });

  it('blocks a group for a checked disabled radio outside the form that belongs to it', () => {
    const doc = parse(`<form id="f1">
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" />
      </form>
      <input type="radio" name="r" value="c" form="f1" disabled checked />`);
    expect(fieldCount(doc)).toBe(0);
  });

  it('treats a radio inside one form with form="other" as another group', () => {
    const doc = parse(`<form id="f1">
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" />
        <input type="radio" name="r" value="x" form="f2" disabled checked />
      </form><form id="f2"></form>`);
    const { scan } = scanForm(doc);
    expect(scan.fields).toHaveLength(1);
    expect(scan.fields[0]?.options).toEqual(['a', 'b']);
  });

  it('does not let a checked peer in another form block this form', () => {
    const doc = parse(`<form id="f1">
        <input type="radio" name="r" value="a" />
        <input type="radio" name="r" value="b" />
      </form>
      <form id="f2">
        <input type="radio" name="r" value="d" />
        <input type="radio" name="r" value="c" disabled checked />
      </form>`);
    const { scan } = scanForm(doc);
    expect(scan.fields.map((f) => f.options)).toEqual([['a', 'b']]);
  });
});
