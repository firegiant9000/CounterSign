import { describe, expect, it } from 'vitest';
import { DEFAULT_ANSWERS, formatAnswer } from '../answers';
import type { ProfileKey } from '../profile';
import type { AnswerValue, CanonicalAnswer } from '../types';
import { buildPlan } from './plan';
import { DEFAULT_TABLES, type RecognitionTables } from './tables';
import type { FormScan, PlanInput, ScannedField } from './types';

let nextRef = 0;

function field(overrides: Partial<ScannedField> = {}): ScannedField {
  nextRef += 1;
  return {
    ref: nextRef,
    control: 'text',
    label: '',
    autocomplete: '',
    required: false,
    value: '',
    options: [],
    checked: [],
    multiple: false,
    optionsTruncated: false,
    ...overrides,
  };
}

function scanOf(fields: ScannedField[], frames: string[] = []): FormScan {
  return { fields, frames, truncated: false };
}

function answer(key: string, value: unknown): CanonicalAnswer {
  const def = DEFAULT_ANSWERS.find((d) => d.key === key);
  return {
    id: `id-${key}`,
    createdAt: '2026-11-20T00:00:00.000Z',
    key,
    label: def?.label ?? key,
    type: def?.type,
    value: value as AnswerValue,
  };
}

const SALARY: AnswerValue = {
  type: 'money_range',
  min: 100000,
  max: 120000,
  currency: 'USD',
  period: 'year',
};

const SAM_PROFILE: Record<ProfileKey, string> = {
  full_name: 'Sam Example',
  first_name: 'Sam',
  last_name: 'Example',
  email: 'sam@example.com',
  phone: '555-010-0142',
  address_line1: '12 Example Street',
  address_line2: 'Unit 4',
  city: 'Springfield',
  region: 'Example State',
  postal_code: '00000',
  country: 'United States',
  linkedin: 'https://example.com/in/sam',
  github: 'https://example.com/sam',
  website: 'https://example.com',
};

const SAM_ANSWERS: CanonicalAnswer[] = [
  answer('work_authorization', { type: 'yes_no', value: true }),
  answer('sponsorship', { type: 'yes_no', value: false }),
  answer('salary_range', SALARY),
  answer('earliest_start_date', { type: 'date', value: '2026-12-01' }),
  answer('relocation', { type: 'choice', value: 'Depends on location' }),
  answer('reason_for_leaving', {
    type: 'text',
    value: 'Looking for a new challenge',
  }),
];

const sam: PlanInput = { profile: { ...SAM_PROFILE }, answers: SAM_ANSWERS };

function withProfile(changes: Partial<Record<ProfileKey, string>>): PlanInput {
  return { profile: { ...SAM_PROFILE, ...changes }, answers: SAM_ANSWERS };
}

function withAnswers(answers: CanonicalAnswer[]): PlanInput {
  return { profile: { ...SAM_PROFILE }, answers };
}

function yesNoSelect(label: string, overrides: Partial<ScannedField> = {}) {
  return field({
    control: 'select',
    label,
    options: ['Yes', 'No'],
    ...overrides,
  });
}

function expectNoBadWrites(plan: ReturnType<typeof buildPlan>): void {
  for (const w of plan.writes) {
    if (w.kind === 'value') {
      expect(w.value).not.toBe('undefined');
      expect(w.value).not.toContain('[object');
    }
  }
}

const AUTH = 'Are you legally authorized to work';

describe('buildPlan: profile fields', () => {
  it('fills an empty contact block', () => {
    const fields = ['First name', 'Last name', 'Email', 'Phone'].map((label) =>
      field({ label }),
    );
    const plan = buildPlan(scanOf(fields), sam);
    expect(plan.rows.map((r) => r.status)).toEqual([
      'will_fill',
      'will_fill',
      'will_fill',
      'will_fill',
    ]);
    expect(plan.writes).toEqual([
      { ref: fields[0]!.ref, kind: 'value', value: 'Sam' },
      { ref: fields[1]!.ref, kind: 'value', value: 'Example' },
      { ref: fields[2]!.ref, kind: 'value', value: 'sam@example.com' },
      { ref: fields[3]!.ref, kind: 'value', value: '555-010-0142' },
    ]);
  });

  it('matches, case and format aside', () => {
    const email = field({ label: 'Email', value: 'SAM@example.com' });
    const phone = field({ label: 'Phone', value: '+1 555 010 0142' });
    const plan = buildPlan(scanOf([email, phone]), sam);
    expect(plan.rows.map((r) => r.status)).toEqual(['matches', 'matches']);
    expect(plan.writes).toEqual([]);
  });

  it('never replaces a value', () => {
    const email = field({ label: 'Email', value: 'other@example.com' });
    const plan = buildPlan(scanOf([email]), sam);
    expect(plan.rows[0]).toMatchObject({
      status: 'differs',
      formValue: 'other@example.com',
      ownValue: 'sam@example.com',
    });
    expect(plan.rows[0]!.write).toBeUndefined();
    expect(plan.writes).toEqual([]);
  });

  it('reports no value when the profile lacks the key', () => {
    const input = withProfile({ first_name: '   ' });
    const plan = buildPlan(scanOf([field({ label: 'First name' })]), input);
    expect(plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'no_value',
      ownValue: '',
    });
    const missing: PlanInput = { profile: {}, answers: [] };
    const again = buildPlan(scanOf([field({ label: 'First name' })]), missing);
    expect(again.rows[0]!.reason).toBe('no_value');
  });

  it('marks duplicated profile fields ambiguous and keeps the owner value', () => {
    const fields = [
      field({ label: 'Name' }),
      field({ label: 'Email' }),
      field({ label: 'Name' }),
      field({ label: 'Email' }),
    ];
    const plan = buildPlan(scanOf(fields), sam);
    expect(plan.rows.map((r) => r.reason)).toEqual([
      'ambiguous',
      'ambiguous',
      'ambiguous',
      'ambiguous',
    ]);
    expect(plan.rows.map((r) => r.ownValue)).toEqual([
      'Sam Example',
      'sam@example.com',
      'Sam Example',
      'sam@example.com',
    ]);
    expect(plan.writes).toEqual([]);
  });

  it('puts a country into a select and a text field', () => {
    const select = field({
      control: 'select',
      label: 'Country',
      options: ['Canada', 'United States'],
    });
    const plan = buildPlan(scanOf([select]), sam);
    expect(plan.rows[0]).toMatchObject({
      status: 'will_fill',
      write: { ref: select.ref, kind: 'option', index: 1 },
    });
  });

  it('files are never filled and have no target', () => {
    const plan = buildPlan(
      scanOf([field({ control: 'file', label: 'Resume' })]),
      sam,
    );
    expect(plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'file',
    });
    expect(plan.rows[0]!.target).toBeUndefined();
  });
});

describe('buildPlan: answers', () => {
  it('fills each answer into its control', () => {
    const auth = yesNoSelect(`${AUTH} in the United States?`);
    const relocate = field({
      control: 'select',
      label: 'Are you willing to relocate?',
      options: ['Yes', 'No', 'Depends on location'],
    });
    const start = field({ control: 'date', label: 'Earliest start date' });
    const reason = field({ control: 'textarea', label: 'Reason for leaving' });
    const plan = buildPlan(scanOf([auth, relocate, start, reason]), sam);
    expect(plan.writes).toEqual([
      { ref: auth.ref, kind: 'option', index: 0 },
      { ref: relocate.ref, kind: 'option', index: 2 },
      { ref: start.ref, kind: 'value', value: '2026-12-01' },
      { ref: reason.ref, kind: 'value', value: 'Looking for a new challenge' },
    ]);
    expect(plan.rows[0]!.answerValue).toEqual({ type: 'yes_no', value: true });
  });

  it('never writes the salary', () => {
    const plan = buildPlan(scanOf([field({ label: 'Desired salary' })]), sam);
    expect(plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'never_auto',
      ownValue: formatAnswer(SALARY),
    });
    expect(plan.rows[0]!.ownValue).not.toBe('');
    expect(plan.writes).toEqual([]);
  });

  it('does not answer a negated question', () => {
    const plan = buildPlan(
      scanOf([
        yesNoSelect('Are you not authorized to work in the United States?'),
      ]),
      sam,
    );
    expect(plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'negated',
      ownValue: '',
    });
    expect(plan.rows[0]!.answerValue).toBeUndefined();
  });

  it('marks a question that matches two answers ambiguous', () => {
    const plan = buildPlan(
      scanOf([
        yesNoSelect('Are you authorized to work without visa sponsorship?'),
      ]),
      sam,
    );
    expect(plan.rows[0]).toMatchObject({
      reason: 'ambiguous',
      ownValue: '',
      target: { kind: 'answer', key: 'work_authorization' },
    });
  });

  it('marks duplicated answers ambiguous', () => {
    const plan = buildPlan(
      scanOf([
        yesNoSelect('Are you authorized to work in the U.S.?'),
        yesNoSelect('Is your authorized to work status current?'),
      ]),
      sam,
    );
    expect(plan.rows.map((r) => r.reason)).toEqual(['ambiguous', 'ambiguous']);
    expect(plan.rows.map((r) => r.ownValue)).toEqual(['', '']);
    expect(plan.writes).toEqual([]);
  });

  it('a question matching two answers counts for neither in the duplicate pass', () => {
    const plan = buildPlan(
      scanOf([
        yesNoSelect('Are you authorized to work without visa sponsorship?'),
        yesNoSelect(`${AUTH}?`),
      ]),
      sam,
    );
    expect(plan.rows.map((r) => r.reason)).toEqual(['ambiguous', undefined]);
    expect(plan.rows[1]!.status).toBe('will_fill');
  });

  it.each([
    ['Canada', sam],
    ['Canada', { profile: {}, answers: SAM_ANSWERS }],
    ['Canada', withProfile({ country: 'Narnia' })],
    ['the EU', sam],
    ['Estonia', sam],
  ])('treats %s as another country', (place, input) => {
    const plan = buildPlan(
      scanOf([yesNoSelect(`${AUTH} in ${place}?`)]),
      input,
    );
    expect(plan.rows[0]).toMatchObject({
      reason: 'other_country',
      ownValue: '',
    });
    expect(plan.rows[0]!.answerValue).toBeUndefined();
    expect(plan.writes).toEqual([]);
  });

  it("fills for the owner's own country, by any spelling", () => {
    const plan = buildPlan(
      scanOf([yesNoSelect(`${AUTH} in the U.S.?`)]),
      withProfile({ country: 'USA' }),
    );
    expect(plan.rows[0]!.status).toBe('will_fill');
  });

  it('fills when no country is named', () => {
    const plan = buildPlan(scanOf([yesNoSelect(`${AUTH}?`)]), sam);
    expect(plan.rows[0]!.status).toBe('will_fill');
  });

  it('does not write into a custom control', () => {
    const plan = buildPlan(
      scanOf([field({ control: 'custom', label: `${AUTH}?` })]),
      sam,
    );
    expect(plan.rows[0]).toMatchObject({
      reason: 'custom_control',
      ownValue: 'Yes',
    });
  });

  it('reports an unsupported control', () => {
    const plan = buildPlan(
      scanOf([field({ control: 'text', label: 'Earliest start date' })]),
      sam,
    );
    expect(plan.rows[0]).toMatchObject({
      reason: 'unsupported_control',
      ownValue: '2026-12-01',
    });
  });

  it('compares a held answer to the owner', () => {
    const same = field({
      control: 'select',
      label: `${AUTH}?`,
      options: ['Yes', 'No'],
      value: 'yes',
    });
    const other = field({
      control: 'select',
      label: 'Do you need visa sponsorship?',
      options: ['Yes', 'No'],
      value: 'Yes',
    });
    const plan = buildPlan(scanOf([same, other]), sam);
    expect(plan.rows.map((r) => r.status)).toEqual(['matches', 'differs']);
    expect(plan.writes).toEqual([]);
  });
});

describe('buildPlan: unrecognised, frames, tables', () => {
  it('flags a required unknown field and counts optional ones', () => {
    const plan = buildPlan(
      scanOf([
        field({ label: 'Favourite colour', required: true }),
        field({ label: 'Pet name' }),
        field({ label: 'Shoe size' }),
      ]),
      sam,
    );
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'not_recognised',
    });
    expect(plan.rows[0]!.target).toBeUndefined();
    expect(plan.unrecognisedOptional).toBe(2);
  });

  it('lists a frame and no rows for a scan without fields', () => {
    const plan = buildPlan(
      scanOf([], ['https://boards.greenhouse.io/embed/job_app?for=example']),
      sam,
    );
    expect(plan.rows).toEqual([]);
    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0]!.site).toBe('greenhouse');
  });

  it('takes the recognition tables as an argument', () => {
    const label = 'Do you hold a valid work permit?';
    const scan = scanOf([yesNoSelect(label)]);
    expect(buildPlan(scan, sam).rows).toEqual([]);
    const tables: RecognitionTables = {
      ...DEFAULT_TABLES,
      answerPhrases: new Map([
        ...DEFAULT_TABLES.answerPhrases,
        ['work_authorization', ['work permit']],
      ]),
    };
    const plan = buildPlan(scan, sam, tables);
    expect(plan.rows[0]).toMatchObject({
      status: 'will_fill',
      target: { kind: 'answer', key: 'work_authorization' },
    });
  });
});

describe('buildPlan: odd answer records', () => {
  const auth = () => yesNoSelect(`${AUTH}?`);

  it.each<[string, CanonicalAnswer[]]>([
    [
      'a record with no key',
      [{ id: 'x', createdAt: 'now', value: { type: 'yes_no', value: true } }],
    ],
    [
      'the wrong value type',
      [answer('work_authorization', { type: 'text', value: 'yes' })],
    ],
    ['a string for a value', [answer('work_authorization', 'Yes')]],
    ['a null value', [answer('work_authorization', null)]],
    [
      'a first record without a value',
      [
        answer('work_authorization', undefined),
        answer('work_authorization', { type: 'yes_no', value: true }),
      ],
    ],
    [
      'a non-boolean yes/no',
      [answer('work_authorization', { type: 'yes_no', value: 'true' })],
    ],
    ['a null record', [null as never]],
  ])('gives no value for %s', (_name, answers) => {
    const plan = buildPlan(scanOf([auth()]), withAnswers(answers));
    expect(plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'no_value',
      ownValue: '',
    });
    expect(plan.rows[0]!.answerValue).toBeUndefined();
    expect(plan.writes).toEqual([]);
    expectNoBadWrites(plan);
  });

  it('never writes a malformed date or a blank text answer', () => {
    const fields = [
      field({ control: 'date', label: 'Earliest start date' }),
      field({ control: 'textarea', label: 'Reason for leaving' }),
    ];
    const plan = buildPlan(
      scanOf(fields),
      withAnswers([
        answer('earliest_start_date', { type: 'date', value: '12/01/2026' }),
        answer('reason_for_leaving', { type: 'text', value: '   ' }),
      ]),
    );
    expect(plan.rows.map((r) => r.reason)).toEqual(['no_value', 'no_value']);
    expect(plan.writes).toEqual([]);
  });

  it('a missing profile object value is no value, not "undefined"', () => {
    const odd = { profile: { email: 5 as never }, answers: [] };
    const plan = buildPlan(scanOf([field({ label: 'Email' })]), odd);
    expect(plan.rows[0]!.reason).toBe('no_value');
    expectNoBadWrites(plan);
  });
});

describe('buildPlan: rule order and guards', () => {
  it.each([
    [
      'a negated question',
      'Are you not authorized to work in the United States?',
      'negated',
    ],
    ['a question naming Canada', `${AUTH} in Canada?`, 'other_country'],
  ])('rule 6 comes before the custom control rule: %s', (_n, label, reason) => {
    const plan = buildPlan(scanOf([field({ control: 'custom', label })]), sam);
    expect(plan.rows[0]).toMatchObject({ reason, ownValue: '' });
    expect(plan.rows[0]).not.toHaveProperty('answerValue');
  });

  it('applies the place check to sponsorship', () => {
    const canada = yesNoSelect('Do you need visa sponsorship in Canada?');
    const us = yesNoSelect(
      'Do you need visa sponsorship in the United States?',
    );
    const plan = buildPlan(scanOf([canada]), sam);
    expect(plan.rows[0]).toMatchObject({
      reason: 'other_country',
      ownValue: '',
    });
    expect(plan.rows[0]).not.toHaveProperty('answerValue');
    expect(buildPlan(scanOf([us]), sam).rows[0]!.status).toBe('will_fill');
  });

  it('marks a profile key matched by a custom control and a text field ambiguous', () => {
    const plan = buildPlan(
      scanOf([
        field({ label: 'Email' }),
        field({ control: 'custom', label: 'Email' }),
      ]),
      sam,
    );
    expect(plan.rows.map((r) => r.reason)).toEqual(['ambiguous', 'ambiguous']);
  });

  it('gives a file field labelled Email the file row, with no write', () => {
    const plan = buildPlan(
      scanOf([field({ control: 'file', label: 'Email' })]),
      sam,
    );
    expect(plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'file',
    });
    expect(plan.rows[0]!.target).toBeUndefined();
    expect(plan.rows[0]!.write).toBeUndefined();
    expect(plan.writes).toEqual([]);
  });

  it('does not count a file field as a duplicate', () => {
    const text = field({ label: 'Email' });
    const plan = buildPlan(
      scanOf([field({ control: 'file', label: 'Email' }), text]),
      sam,
    );
    expect(plan.rows[1]!.status).toBe('will_fill');
    expect(plan.writes).toEqual([
      { ref: text.ref, kind: 'value', value: 'sam@example.com' },
    ]);
  });

  it('trims the owner values it offers and writes', () => {
    const name = field({ label: 'First name' });
    const reason = field({ control: 'textarea', label: 'Reason for leaving' });
    const input: PlanInput = {
      profile: { first_name: '  Sam  ' },
      answers: [
        answer('reason_for_leaving', { type: 'text', value: '  Moving on  ' }),
      ],
    };
    const plan = buildPlan(scanOf([name, reason]), input);
    expect(plan.rows.map((r) => r.ownValue)).toEqual(['Sam', 'Moving on']);
    expect(plan.writes).toEqual([
      { ref: name.ref, kind: 'value', value: 'Sam' },
      { ref: reason.ref, kind: 'value', value: 'Moving on' },
    ]);
  });

  it('joins the checked options of a group in checked order', () => {
    const group = field({
      control: 'choice_group',
      label: 'Are you not willing to relocate?',
      options: ['Red', 'Green', 'Blue'],
      checked: [2, 0],
      multiple: true,
    });
    const plan = buildPlan(scanOf([group]), sam);
    expect(plan.rows[0]!.formValue).toBe('Blue, Red');
  });
});

describe('buildPlan: invariants', () => {
  it('holds over a large mixed scan', () => {
    // Every profile and answer key is used by one field, except the Name pair.
    const fields: ScannedField[] = [
      field({ label: 'First name' }), // will_fill (profile)
      field({ label: 'Email', value: 'other@example.com' }), // differs
      field({ label: 'Phone', value: '555-010-0142' }), // matches
      field({ label: 'Name' }), // ambiguous (the deliberate pair)
      field({ label: 'Name' }),
      field({ control: 'file', label: 'Resume' }), // file
      field({ label: 'Favourite colour', required: true }), // not_recognised
      field({ label: 'Pet name' }), // optional, counted
      field({ control: 'custom', label: 'City' }), // custom_control
      field({ label: 'GitHub' }), // no_value (profile lacks it)
      field({
        control: 'select',
        label: 'Country',
        options: ['Canada', 'United States'],
      }), // will_fill (profile, option)
      field({ label: 'Desired salary' }), // never_auto
      yesNoSelect(`${AUTH}?`), // will_fill (answer)
      yesNoSelect('Do you need visa sponsorship in Canada?'), // other_country
      field({
        control: 'select',
        label: 'Are you not willing to relocate?',
        options: ['Yes', 'No', 'Depends on location'],
      }), // negated
      yesNoSelect('Authorized to work, and need visa sponsorship?'), // two answers
      field({ label: 'Earliest start date' }), // unsupported_control
      field({ control: 'textarea', label: 'Reason for leaving' }), // will_fill (answer)
      field({ label: 'LinkedIn', value: 'https://example.com/in/sam' }), // matches
    ];
    const noGithub: Partial<Record<ProfileKey, string>> = { ...SAM_PROFILE };
    delete noGithub.github;
    const plan = buildPlan(scanOf(fields), {
      profile: noGithub,
      answers: SAM_ANSWERS,
    });
    const willFill = plan.rows.filter((r) => r.status === 'will_fill');

    // The scan must keep covering every outcome.
    const seen = new Set(
      plan.rows.map((r) => {
        const kind = r.target?.kind ?? 'none';
        return r.status === 'not_filled'
          ? `not_filled:${r.reason}`
          : `${r.status}:${kind}`;
      }),
    );
    for (const expected of [
      'will_fill:profile',
      'will_fill:answer',
      'matches:profile',
      'differs:profile',
      'not_filled:negated',
      'not_filled:other_country',
      'not_filled:no_value',
      'not_filled:custom_control',
      'not_filled:unsupported_control',
      'not_filled:ambiguous',
      'not_filled:never_auto',
      'not_filled:file',
      'not_filled:not_recognised',
    ]) {
      expect(seen).toContain(expected);
    }
    for (const row of willFill) expect(row.write?.ref).toBe(row.ref);
    expect(
      plan.rows.filter((r) => r.reason === 'ambiguous').length,
    ).toBeGreaterThanOrEqual(3);

    for (const row of plan.rows) {
      expect(row.reason !== undefined).toBe(row.status === 'not_filled');
      expect(row.write !== undefined).toBe(row.status === 'will_fill');
      expect(row.answerValue !== undefined).toBe(
        row.target?.kind === 'answer' && row.ownValue !== '',
      );
    }
    for (const row of willFill) expect(row.formValue).toBe('');
    expect(plan.writes).toEqual(willFill.map((r) => r.write));
    expect(new Set(plan.writes.map((w) => w.ref)).size).toBe(
      plan.writes.length,
    );
    expect(willFill.length).toBeGreaterThan(3);
    expect(plan.unrecognisedOptional).toBe(1);
    expectNoBadWrites(plan);
  });
});
