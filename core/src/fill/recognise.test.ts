import { describe, expect, it } from 'vitest';
import { DEFAULT_ANSWERS } from '../answers';
import { PROFILE_FIELDS, type ProfileKey } from '../profile';
import { normalizeLabel } from './normalize';
import { recogniseAnswers, recogniseProfile } from './recognise';
import { DEFAULT_TABLES } from './tables';

const profile = (label: string, autocomplete = '') =>
  recogniseProfile({ label, autocomplete }, DEFAULT_TABLES);
const answers = (label: string) => recogniseAnswers({ label }, DEFAULT_TABLES);

describe('DEFAULT_TABLES', () => {
  it('has exactly the 14 profile keys', () => {
    expect([...DEFAULT_TABLES.profilePhrases.keys()].sort()).toEqual(
      PROFILE_FIELDS.map((f) => f.key).sort(),
    );
  });

  it('lists the answer keys in the order of DEFAULT_ANSWERS', () => {
    expect([...DEFAULT_TABLES.answerPhrases.keys()]).toEqual(
      DEFAULT_ANSWERS.map((a) => a.key),
    );
  });

  it('stores every phrase in normalised form', () => {
    const all = [
      ...[...DEFAULT_TABLES.profilePhrases.values()].flat(),
      ...[...DEFAULT_TABLES.answerPhrases.values()].flat(),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const phrase of all) expect(normalizeLabel(phrase)).toBe(phrase);
  });

  it('has no phrase under two profile keys', () => {
    const all = [...DEFAULT_TABLES.profilePhrases.values()].flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('pins the autocomplete table to the design', () => {
    expect(DEFAULT_TABLES.profileAutocomplete.size).toBe(12);
    expect([...DEFAULT_TABLES.profileAutocomplete]).toEqual([
      ['name', 'full_name'],
      ['given-name', 'first_name'],
      ['family-name', 'last_name'],
      ['email', 'email'],
      ['tel', 'phone'],
      ['tel-national', 'phone'],
      ['address-line1', 'address_line1'],
      ['address-line2', 'address_line2'],
      ['address-level2', 'city'],
      ['address-level1', 'region'],
      ['postal-code', 'postal_code'],
      ['country-name', 'country'],
    ]);
  });

  it('pins the profile label phrases to the design', () => {
    expect([...DEFAULT_TABLES.profilePhrases]).toEqual([
      ['full_name', ['name', 'full name', 'your name', 'legal name']],
      ['first_name', ['first name', 'given name']],
      ['last_name', ['last name', 'surname', 'family name']],
      ['email', ['email', 'email address', 'e mail']],
      [
        'phone',
        ['phone', 'phone number', 'mobile', 'mobile number', 'telephone'],
      ],
      ['address_line1', ['address', 'street address', 'address line 1']],
      ['address_line2', ['address line 2']],
      ['city', ['city']],
      ['region', ['state', 'province', 'region', 'state or province']],
      ['postal_code', ['zip', 'zip code', 'postal code', 'postcode']],
      ['country', ['country']],
      ['linkedin', ['linkedin', 'linkedin url', 'linkedin profile']],
      ['github', ['github', 'github url', 'github profile']],
      [
        'website',
        [
          'website',
          'personal website',
          'portfolio',
          'portfolio url',
          'other website',
          'other website url',
        ],
      ],
    ]);
  });

  it('pins the answer phrases to the design', () => {
    expect([...DEFAULT_TABLES.answerPhrases]).toEqual([
      [
        'work_authorization',
        [
          'authorized to work',
          'authorised to work',
          'eligible to work',
          'legally authorized',
          'legally authorised',
          'right to work',
        ],
      ],
      [
        'sponsorship',
        [
          'require sponsorship',
          'need sponsorship',
          'visa sponsorship',
          'sponsorship for employment',
          'immigration sponsorship',
        ],
      ],
      [
        'salary_range',
        ['salary', 'compensation', 'expected pay', 'desired pay'],
      ],
      [
        'earliest_start_date',
        [
          'start date',
          'available to start',
          'when can you start',
          'earliest start',
        ],
      ],
      [
        'relocation',
        [
          'willing to relocate',
          'open to relocating',
          'open to relocation',
          'able to relocate',
        ],
      ],
      ['reason_for_leaving', ['reason for leaving', 'why are you leaving']],
    ]);
  });
});

describe('recogniseProfile', () => {
  it.each<[ProfileKey, string, string, ProfileKey | undefined]>([
    ['full_name', 'Full name', 'Company name', undefined],
    ['first_name', 'First Name *', 'First name of referee', undefined],
    ['last_name', 'Surname', 'Maiden surname', undefined],
    ['email', 'Email address', 'Reference email', undefined],
    ['phone', 'Mobile number', 'Emergency phone', undefined],
    ['address_line1', 'Street address', 'Email address', 'email'],
    ['address_line2', 'Address line 2', 'Address line 3', undefined],
    ['city', 'City', 'City of birth', undefined],
    ['region', 'State or province', 'State of mind', undefined],
    ['postal_code', 'ZIP code', 'Area code', undefined],
    ['country', 'Country', 'Country of birth', undefined],
    ['linkedin', 'LinkedIn URL', 'LinkedIn headline', undefined],
    ['github', 'GitHub profile', 'GitHub stars', undefined],
    ['website', 'Portfolio URL', 'Website feedback', undefined],
  ])('%s has a match and a near miss', (key, match, nearMiss, nearResult) => {
    expect(profile(match)).toBe(key);
    expect(profile(nearMiss)).toBe(nearResult);
  });

  it('lets autocomplete beat the label', () => {
    expect(profile('Reference email', 'email')).toBe('email');
    expect(profile('Email', 'family-name')).toBe('last_name');
    expect(profile('Email', 'off')).toBe('email');
  });

  it('gives undefined for an empty label with no known token', () => {
    expect(profile('')).toBeUndefined();
    expect(profile('', 'organization')).toBeUndefined();
  });

  it.each<[string, ProfileKey]>([
    ['name', 'full_name'],
    ['given-name', 'first_name'],
    ['family-name', 'last_name'],
    ['email', 'email'],
    ['tel', 'phone'],
    ['tel-national', 'phone'],
    ['address-line1', 'address_line1'],
    ['address-line2', 'address_line2'],
    ['address-level2', 'city'],
    ['address-level1', 'region'],
    ['postal-code', 'postal_code'],
    ['country-name', 'country'],
  ])('maps the autocomplete token %s to %s', (token, key) => {
    expect(profile('', token)).toBe(key);
  });

  it('does not recognise prototype names', () => {
    for (const token of ['constructor', '__proto__', 'toString']) {
      expect(profile('', token)).toBeUndefined();
    }
    for (const label of ['constructor', 'hasOwnProperty']) {
      expect(profile(label)).toBeUndefined();
      expect(answers(label)).toEqual([]);
    }
  });
});

describe('recogniseAnswers', () => {
  it.each<[string, string[]]>([
    [
      'Are you legally authorized to work in the United States?',
      ['work_authorization'],
    ],
    [
      'Will you now or in the future require sponsorship for employment visa status?',
      ['sponsorship'],
    ],
    ['Are you willing to relocate?', ['relocation']],
    ['When can you start?', ['earliest_start_date']],
    ['Reason for leaving your last role', ['reason_for_leaving']],
    ['Desired salary', ['salary_range']],
  ])('matches %s', (question, expected) => {
    expect(answers(question)).toEqual(expected);
  });

  it('returns both answers of a two-answer question, in table order', () => {
    expect(
      answers('Are you authorized to work without visa sponsorship?'),
    ).toEqual(['work_authorization', 'sponsorship']);
    expect(
      answers('Visa sponsorship: are you authorized to work here?'),
    ).toEqual(['work_authorization', 'sponsorship']);
  });

  it('returns each key once when several phrases match', () => {
    expect(
      answers('Authorized to work? Eligible to work? Right to work?'),
    ).toEqual(['work_authorization']);
  });

  it('returns nothing when no phrase matches', () => {
    expect(answers('Why do you want to work here?')).toEqual([]);
  });
});
