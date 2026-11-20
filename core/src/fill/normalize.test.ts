import { describe, expect, it } from 'vitest';
import {
  containsPhrase,
  hasNegation,
  isPlaceholderOption,
  normalizeLabel,
} from './normalize';

describe('normalizeLabel', () => {
  it('lower-cases and drops required markers and stars', () => {
    expect(normalizeLabel('First Name *')).toBe('first name');
    expect(normalizeLabel('E-mail (required)')).toBe('e mail');
    expect(normalizeLabel('Phone ✱')).toBe('phone');
  });

  it('drops optional markers regardless of case', () => {
    expect(normalizeLabel('State/Province (Optional)')).toBe('state province');
  });

  it('turns punctuation into spaces and trims', () => {
    expect(normalizeLabel('  LinkedIn URL: ')).toBe('linkedin url');
    expect(normalizeLabel('U.S.')).toBe('u s');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeLabel('')).toBe('');
  });

  it('keeps words apart when a required marker sits between them', () => {
    expect(normalizeLabel('Name(required)here')).toBe('name here');
  });

  it('collapses repeated spaces inside a label', () => {
    expect(normalizeLabel('FIRST   NAME')).toBe('first name');
  });

  it('drops a leading optional marker', () => {
    expect(normalizeLabel('(Optional) City')).toBe('city');
  });
});

describe('containsPhrase', () => {
  it('matches a phrase of whole words inside the text', () => {
    expect(
      containsPhrase(
        'are you legally authorized to work in the united states',
        'authorized to work',
      ),
    ).toBe(true);
  });

  it('does not match a phrase that is only part of a word', () => {
    expect(
      containsPhrase('i am unauthorized to work', 'authorized to work'),
    ).toBe(false);
  });

  it('matches a single whole word', () => {
    expect(containsPhrase('salary', 'salary')).toBe(true);
  });

  it('does not match a word that only starts with the phrase', () => {
    expect(containsPhrase('salaryman', 'salary')).toBe(false);
  });

  it('returns false for an empty phrase', () => {
    expect(containsPhrase('salary', '')).toBe(false);
  });
});

describe('hasNegation', () => {
  it.each([
    'Are you not authorized',
    "Don't you need sponsorship?",
    'Don’t you',
    'Donʼt you',
    'Don‘t you',
    'Don`t you',
    'without sponsorship',
    'no longer eligible',
    'no\nlonger eligible',
    'no  longer eligible',
    'no longer eligible',
    'cannot work',
    'unless sponsored',
  ])('is true for %j', (raw) => {
    expect(hasNegation(raw)).toBe(true);
  });

  it.each(['Are you authorized to work?', 'Notice period', 'Notes', 'Nothing'])(
    'is false for %j',
    (raw) => {
      expect(hasNegation(raw)).toBe(false);
    },
  );
});

describe('isPlaceholderOption', () => {
  it('treats an empty value as a placeholder at any index', () => {
    expect(isPlaceholderOption('Choose one', '', 0)).toBe(true);
    expect(isPlaceholderOption('No', '', 2)).toBe(true);
  });

  it('treats a leading select, choose, please or pick option as a placeholder', () => {
    expect(isPlaceholderOption('Select...', 'Select...', 0)).toBe(true);
    expect(isPlaceholderOption('Please select', 'p', 0)).toBe(true);
    expect(isPlaceholderOption('Pick one', 'p', 0)).toBe(true);
  });

  it('treats a first option with no letters or digits as a placeholder', () => {
    expect(isPlaceholderOption('--', 'x', 0)).toBe(true);
    expect(isPlaceholderOption('--', 'x', 1)).toBe(false);
  });

  it('does not treat a word that only starts with a placeholder word as one', () => {
    expect(isPlaceholderOption('Pickup', 'p', 0)).toBe(false);
    expect(isPlaceholderOption('Selection', 's', 0)).toBe(false);
    expect(isPlaceholderOption('Chooser', 'c', 0)).toBe(false);
  });

  it('keeps a real option that is not first', () => {
    expect(isPlaceholderOption('Select Committee', 's', 1)).toBe(false);
  });

  it('keeps a real first option', () => {
    expect(isPlaceholderOption('Yes', 'yes', 0)).toBe(false);
  });
});
