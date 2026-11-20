import { describe, expect, it } from 'vitest';
import type { FormScan, ScannedField } from './types';
import { toApplyResult, toFormScan } from './validate';

function field(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ref: 0,
    control: 'text',
    label: 'First name',
    autocomplete: 'given-name',
    required: true,
    value: '',
    options: [],
    checked: [],
    multiple: false,
    optionsTruncated: false,
    ...over,
  };
}

function scanOf(
  fields: unknown[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { fields, frames: [], truncated: false, ...extra };
}

describe('toFormScan', () => {
  it('passes a well-formed scan through', () => {
    const fields: ScannedField[] = [
      {
        ref: 0,
        control: 'text',
        label: 'Name',
        autocomplete: 'name',
        required: true,
        value: 'Ada Example',
        options: [],
        checked: [],
        multiple: false,
        optionsTruncated: false,
      },
      {
        ref: 1,
        control: 'textarea',
        label: 'Why us',
        autocomplete: '',
        required: false,
        value: 'Because',
        options: [],
        checked: [],
        multiple: false,
        optionsTruncated: false,
      },
      {
        ref: 2,
        control: 'date',
        label: 'Start date',
        autocomplete: '',
        required: false,
        value: '2026-12-01',
        options: [],
        checked: [],
        multiple: false,
        optionsTruncated: false,
      },
      {
        ref: 3,
        control: 'select',
        label: 'Country',
        autocomplete: 'country',
        required: false,
        value: 'Canada',
        options: ['Canada', 'Mexico'],
        checked: [],
        multiple: false,
        optionsTruncated: false,
      },
      {
        ref: 4,
        control: 'choice_group',
        label: 'Authorised',
        autocomplete: '',
        required: true,
        value: '',
        options: ['Yes', 'No'],
        checked: [0],
        multiple: false,
        optionsTruncated: false,
      },
      {
        ref: 5,
        control: 'file',
        label: 'Resume',
        autocomplete: '',
        required: true,
        value: '',
        options: [],
        checked: [],
        multiple: false,
        optionsTruncated: false,
      },
      {
        ref: 6,
        control: 'custom',
        label: 'Skills',
        autocomplete: '',
        required: false,
        value: '',
        options: [],
        checked: [],
        multiple: false,
        optionsTruncated: false,
      },
    ];
    const scan: FormScan = {
      fields,
      frames: ['https://jobs.example.com/a'],
      truncated: false,
    };
    expect(toFormScan(structuredClone(scan))).toEqual(scan);
  });

  it('rejects non-objects', () => {
    expect(toFormScan(undefined)).toBeUndefined();
    expect(toFormScan('x')).toBeUndefined();
    expect(toFormScan([1])).toBeUndefined();
    expect(toFormScan(new Date())).toBeUndefined();
    expect(toFormScan({ fields: 'no' })).toBeUndefined();
    const swapped = Object.create({ x: 1 }) as Record<string, unknown>;
    swapped.fields = [];
    expect(toFormScan(swapped)).toBeUndefined();
  });

  it('caps a hostile scan', () => {
    const many = Array.from({ length: 5000 }, (_, i) => field({ ref: i }));
    const big = toFormScan(scanOf(many));
    expect(big?.fields).toHaveLength(200);
    expect(big?.truncated).toBe(true);

    const one = toFormScan(
      scanOf([
        field({
          label: 'a'.repeat(10_000),
          value: 'b'.repeat(600),
        }),
      ]),
    );
    expect(one?.fields[0]?.label).toHaveLength(300);
    expect(one?.fields[0]?.value).toHaveLength(500);

    const opts = Array.from({ length: 80 }, (_, i) => `o${String(i)}`);
    const sel = toFormScan(
      scanOf([field({ control: 'select', options: opts })]),
    );
    expect(sel?.fields[0]?.options).toHaveLength(50);
    expect(sel?.fields[0]?.optionsTruncated).toBe(true);
  });

  it('caps autocomplete and each option, after trimming', () => {
    const scan = toFormScan(
      scanOf([
        field({
          control: 'select',
          autocomplete: `  ${'X'.repeat(100)}  `,
          options: [`  ${'y'.repeat(400)}  `, '  Yes  '],
        }),
      ]),
    );
    expect(scan?.fields[0]?.autocomplete).toBe('x'.repeat(40));
    expect(scan?.fields[0]?.options).toEqual(['y'.repeat(300), 'Yes']);
  });

  it('trusts truncation flags only when exactly true', () => {
    const scan = toFormScan(
      scanOf([field({ control: 'select', optionsTruncated: true })], {
        truncated: true,
      }),
    );
    expect(scan?.truncated).toBe(true);
    expect(scan?.fields[0]?.optionsTruncated).toBe(true);
    const no = toFormScan(
      scanOf([field({ control: 'select', optionsTruncated: 'true' })], {
        truncated: 1,
      }),
    );
    expect(no?.truncated).toBe(false);
    expect(no?.fields[0]?.optionsTruncated).toBe(false);
  });

  it('drops bad fields', () => {
    const scan = toFormScan(
      scanOf([
        field({ ref: -1 }),
        field({ ref: 1.5 }),
        field({ ref: '2' }),
        field({ ref: 3 }),
        field({ ref: 3, label: 'dup' }),
        field({ ref: 4, control: 'password' }),
        null,
        field({ ref: 5 }),
      ]),
    );
    expect(scan?.fields.map((f) => f.ref)).toEqual([3, 5]);
    expect(scan?.fields[0]?.label).toBe('First name');
  });

  it('coerces types', () => {
    const scan = toFormScan(
      scanOf([
        field({ label: 42, required: 'yes', multiple: 1 }),
        field({
          ref: 1,
          control: 'choice_group',
          options: ['Yes', 7, 'No'],
          checked: [0, 9, 'x'],
          multiple: true,
        }),
        field({ ref: 2, control: 'choice_group', options: ['A', 'B'] }),
      ]),
    );
    expect(scan?.fields[0]?.label).toBe('');
    expect(scan?.fields[0]?.required).toBe(false);
    expect(scan?.fields[0]?.multiple).toBe(false);
    expect(scan?.fields[1]?.options).toEqual(['Yes', 'No']);
    expect(scan?.fields[1]?.checked).toEqual([0]);
    expect(scan?.fields[1]?.multiple).toBe(true);
    expect(scan?.fields[2]?.checked).toEqual([]);
  });

  it('treats a missing or non-array frames, options and checked as empty', () => {
    const scan = toFormScan({
      fields: [
        field({ control: 'choice_group', options: 'Yes', checked: 'x' }),
      ],
      frames: 'https://a.example.com',
    });
    expect(scan?.frames).toEqual([]);
    expect(scan?.fields[0]?.options).toEqual([]);
    expect(scan?.fields[0]?.checked).toEqual([]);
  });

  it('empties values a control does not use', () => {
    const scan = toFormScan(
      scanOf([
        field({ ref: 0, control: 'file', value: 'C:\\x.pdf' }),
        field({ ref: 1, control: 'custom', value: 'x', options: ['a'] }),
        field({
          ref: 2,
          control: 'text',
          value: 'kept',
          options: ['a'],
          checked: [0],
          multiple: true,
        }),
        field({
          ref: 3,
          control: 'select',
          value: 'a',
          options: ['a', 'b'],
          checked: [0],
          multiple: true,
        }),
      ]),
    );
    expect(scan?.fields[0]?.value).toBe('');
    expect(scan?.fields[1]?.value).toBe('');
    expect(scan?.fields[1]?.options).toEqual([]);
    expect(scan?.fields[2]).toMatchObject({
      value: 'kept',
      options: [],
      checked: [],
      multiple: false,
    });
    expect(scan?.fields[3]).toMatchObject({
      value: 'a',
      options: ['a', 'b'],
      checked: [],
      multiple: true,
    });
  });

  it('keeps only https frames', () => {
    const one = toFormScan(
      scanOf([], {
        frames: ['https://jobs.ashbyhq.com/a', 'javascript:alert(1)', 7],
      }),
    );
    expect(one?.frames).toEqual(['https://jobs.ashbyhq.com/a']);

    const six = toFormScan(
      scanOf([], {
        frames: Array.from(
          { length: 6 },
          (_, i) => `https://e.example.com/${String(i)}`,
        ),
      }),
    );
    expect(six?.frames).toHaveLength(5);

    const long = toFormScan(
      scanOf([], { frames: [`https://e.example.com/${'a'.repeat(3000)}`] }),
    );
    expect(long?.frames[0]).toHaveLength(2000);
  });

  it('ignores unknown keys', () => {
    const raw: unknown = JSON.parse(
      '{"fields":[],"frames":[],"extra":1,"__proto__":{"x":1}}',
    );
    expect(toFormScan(raw)).toEqual({
      fields: [],
      frames: [],
      truncated: false,
    });
  });
});

describe('toApplyResult', () => {
  const scan = scanOf([field()]);

  it('passes a good result', () => {
    const result = toApplyResult({
      outcomes: [
        { ref: 0, outcome: 'written' },
        { ref: 1, outcome: 'not_empty' },
      ],
      scan,
    });
    expect(result?.outcomes).toEqual([
      { ref: 0, outcome: 'written' },
      { ref: 1, outcome: 'not_empty' },
    ]);
    expect(result?.scan.fields).toHaveLength(1);
  });

  it('turns an unknown outcome into failed', () => {
    const result = toApplyResult({
      outcomes: [
        { ref: 0, outcome: 'exploded' },
        { ref: 1, outcome: 7 },
      ],
      scan,
    });
    expect(result?.outcomes).toEqual([
      { ref: 0, outcome: 'failed' },
      { ref: 1, outcome: 'failed' },
    ]);
  });

  it('rejects a missing scan or bad shape', () => {
    expect(toApplyResult({ outcomes: [] })).toBeUndefined();
    expect(toApplyResult({ outcomes: [], scan: 'x' })).toBeUndefined();
    expect(toApplyResult({ outcomes: 'no', scan })).toBeUndefined();
    expect(toApplyResult(null)).toBeUndefined();
  });

  it('drops entries without an integer ref and caps at 200', () => {
    const outcomes: unknown[] = [
      { ref: 'a', outcome: 'written' },
      { ref: 1.5, outcome: 'written' },
      null,
      ...Array.from({ length: 300 }, (_, i) => ({
        ref: i,
        outcome: 'written',
      })),
    ];
    const result = toApplyResult({ outcomes, scan });
    expect(result?.outcomes).toHaveLength(200);
    expect(result?.outcomes[0]?.ref).toBe(0);
  });
});
