import { describe, expect, it } from 'vitest';
import { fitField, type OwnKind } from './fit';
import type { ScannedField } from './types';

function field(overrides: Partial<ScannedField> = {}): ScannedField {
  return {
    ref: 3,
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

const UNSUPPORTED = { fit: 'none', reason: 'unsupported_control' };

function select(options: string[], overrides: Partial<ScannedField> = {}) {
  return field({ control: 'select', options, ...overrides });
}

function group(options: string[], overrides: Partial<ScannedField> = {}) {
  return field({ control: 'choice_group', options, ...overrides });
}

describe('fitField: text', () => {
  it.each(['text', 'textarea'] as const)('writes into %s', (control) => {
    expect(fitField(field({ control }), 'text', 'Acme')).toEqual({
      fit: 'write',
      write: { ref: 3, kind: 'value', value: 'Acme' },
    });
  });

  it.each([field({ control: 'date' }), select(['Acme']), group(['Acme'])])(
    'does not fit $control',
    (f) => {
      expect(fitField(f, 'text', 'Acme')).toEqual(UNSUPPORTED);
    },
  );
});

describe('fitField: place', () => {
  it('writes a value into a text control', () => {
    expect(fitField(field(), 'place', 'Canada')).toEqual({
      fit: 'write',
      write: { ref: 3, kind: 'value', value: 'Canada' },
    });
  });

  it('picks the matching option in a select', () => {
    expect(
      fitField(select(['Canada', 'United States']), 'place', 'united states'),
    ).toEqual({ fit: 'write', write: { ref: 3, kind: 'option', index: 1 } });
  });

  it('is unsupported with no equal option', () => {
    expect(fitField(select(['Canada', 'Mexico']), 'place', 'France')).toEqual(
      UNSUPPORTED,
    );
  });

  it('is unsupported with two equal options', () => {
    expect(fitField(select(['Canada', ' canada ']), 'place', 'Canada')).toEqual(
      UNSUPPORTED,
    );
  });

  it('is unsupported for a multi-select', () => {
    expect(
      fitField(select(['Canada'], { multiple: true }), 'place', 'Canada'),
    ).toEqual(UNSUPPORTED);
  });

  it('is unsupported for a choice group', () => {
    expect(fitField(group(['Canada']), 'place', 'Canada')).toEqual(UNSUPPORTED);
  });
});

describe('fitField: yes_no', () => {
  it('picks No in a Yes/No select', () => {
    expect(fitField(select(['Yes', 'No']), 'yes_no', 'No')).toEqual({
      fit: 'write',
      write: { ref: 3, kind: 'option', index: 1 },
    });
  });

  it('picks Yes in a No/Yes select', () => {
    expect(fitField(select(['No', 'Yes']), 'yes_no', 'Yes')).toEqual({
      fit: 'write',
      write: { ref: 3, kind: 'option', index: 1 },
    });
  });

  it('matches option text case-insensitively', () => {
    expect(fitField(select(['yes', 'NO']), 'yes_no', 'No')).toEqual({
      fit: 'write',
      write: { ref: 3, kind: 'option', index: 1 },
    });
  });

  it('is unsupported with a third option', () => {
    expect(fitField(select(['Yes', 'No', 'Maybe']), 'yes_no', 'Yes')).toEqual(
      UNSUPPORTED,
    );
  });

  it('is unsupported with two Yes options', () => {
    expect(fitField(select(['Yes', 'Yes']), 'yes_no', 'Yes')).toEqual(
      UNSUPPORTED,
    );
  });

  it('is unsupported for a multi-select', () => {
    expect(
      fitField(select(['Yes', 'No'], { multiple: true }), 'yes_no', 'Yes'),
    ).toEqual(UNSUPPORTED);
  });

  it('writes into a radio group', () => {
    expect(fitField(group(['Yes', 'No']), 'yes_no', 'Yes')).toEqual({
      fit: 'write',
      write: { ref: 3, kind: 'option', index: 0 },
    });
  });

  it('writes into an empty checkbox pair', () => {
    expect(
      fitField(group(['Yes', 'No'], { multiple: true }), 'yes_no', 'No'),
    ).toEqual({ fit: 'write', write: { ref: 3, kind: 'option', index: 1 } });
  });

  it('holds when one checkbox is checked', () => {
    expect(
      fitField(
        group(['Yes', 'No'], { multiple: true, checked: [0] }),
        'yes_no',
        'No',
      ),
    ).toEqual({ fit: 'holds', formValue: 'Yes' });
  });

  it('holds with both checkboxes checked', () => {
    expect(
      fitField(
        group(['Yes', 'No'], { multiple: true, checked: [0, 1] }),
        'yes_no',
        'No',
      ),
    ).toEqual({ fit: 'holds', formValue: 'Yes, No' });
  });

  it('holds a radio group that arrives with several checked', () => {
    expect(
      fitField(group(['Yes', 'No'], { checked: [0, 1] }), 'yes_no', 'No'),
    ).toEqual({ fit: 'holds', formValue: 'Yes, No' });
  });

  it('is unsupported for a text control', () => {
    expect(fitField(field(), 'yes_no', 'Yes')).toEqual(UNSUPPORTED);
  });
});

describe('fitField: choice', () => {
  it('picks the matching option', () => {
    expect(
      fitField(
        select(['Yes', 'No', 'Depends on location']),
        'choice',
        'Depends on location',
      ),
    ).toEqual({ fit: 'write', write: { ref: 3, kind: 'option', index: 2 } });
  });

  it('is unsupported with no equal option', () => {
    expect(fitField(select(['Yes', 'No']), 'choice', 'Maybe')).toEqual(
      UNSUPPORTED,
    );
  });

  it('is unsupported when two options equal own', () => {
    expect(
      fitField(select(['Other', 'other', 'Mine']), 'choice', 'Other'),
    ).toEqual(UNSUPPORTED);
  });

  it('writes into a checkbox group with one matching option', () => {
    expect(
      fitField(group(['Red', 'Blue'], { multiple: true }), 'choice', 'Blue'),
    ).toEqual({ fit: 'write', write: { ref: 3, kind: 'option', index: 1 } });
  });

  it('is unsupported for a multi-select', () => {
    expect(
      fitField(select(['Red'], { multiple: true }), 'choice', 'Red'),
    ).toEqual(UNSUPPORTED);
  });

  it('is unsupported for a text control', () => {
    expect(fitField(field(), 'choice', 'Red')).toEqual(UNSUPPORTED);
  });
});

describe('fitField: date', () => {
  it('writes into a date control', () => {
    expect(fitField(field({ control: 'date' }), 'date', '2026-12-01')).toEqual({
      fit: 'write',
      write: { ref: 3, kind: 'value', value: '2026-12-01' },
    });
  });

  it('is unsupported for a text control', () => {
    expect(fitField(field(), 'date', '2026-12-01')).toEqual(UNSUPPORTED);
  });
});

describe('fitField: custom and file', () => {
  it.each(['text', 'place', 'yes_no', 'choice', 'date'] as OwnKind[])(
    'reports custom_control for %s',
    (kind) => {
      expect(fitField(field({ control: 'custom' }), kind, 'x')).toEqual({
        fit: 'none',
        reason: 'custom_control',
      });
    },
  );

  it.each(['text', 'place', 'yes_no', 'choice', 'date'] as OwnKind[])(
    'reports unsupported_control for a file with %s',
    (kind) => {
      expect(fitField(field({ control: 'file' }), kind, 'x')).toEqual(
        UNSUPPORTED,
      );
    },
  );
});

describe('fitField: holds', () => {
  it('holds a text value', () => {
    expect(fitField(field({ value: 'x' }), 'text', 'Acme')).toEqual({
      fit: 'holds',
      formValue: 'x',
    });
  });

  it('holds a select value', () => {
    expect(
      fitField(select(['Yes', 'No'], { value: 'Yes' }), 'yes_no', 'No'),
    ).toEqual({ fit: 'holds', formValue: 'Yes' });
  });

  it('holds a select value even when no option equals own', () => {
    expect(
      fitField(select(['Red', 'Blue'], { value: 'Red' }), 'choice', 'Green'),
    ).toEqual({ fit: 'holds', formValue: 'Red' });
  });

  it('holds a date value', () => {
    expect(
      fitField(
        field({ control: 'date', value: '2026-01-01' }),
        'date',
        '2026-12-01',
      ),
    ).toEqual({ fit: 'holds', formValue: '2026-01-01' });
  });
});

describe('fitField: truncated option lists', () => {
  it('never picks from a truncated list', () => {
    expect(
      fitField(
        select(['Canada', 'United States'], { optionsTruncated: true }),
        'place',
        'Canada',
      ),
    ).toEqual(UNSUPPORTED);
  });

  it('checks truncation before what the control holds', () => {
    expect(
      fitField(
        select(['Canada'], { optionsTruncated: true, value: 'Canada' }),
        'place',
        'Canada',
      ),
    ).toEqual(UNSUPPORTED);
  });

  it('is unsupported for a truncated group', () => {
    expect(
      fitField(group(['Red'], { optionsTruncated: true }), 'choice', 'Red'),
    ).toEqual(UNSUPPORTED);
  });
});
