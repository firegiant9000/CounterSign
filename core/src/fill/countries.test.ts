import { describe, expect, it } from 'vitest';
import {
  COUNTRY_NAMES,
  COUNTRY_TABLE,
  EXPANDED_COUNTRY_TABLE,
  EXPANDED_REGION_TABLE,
  REGION_TABLE,
  countryOf,
  placesNamed,
} from './countries';
import { normalizeLabel } from './normalize';

const PREFIX = 'are you authorized to work in ';

describe('COUNTRY_NAMES', () => {
  it('covers the UN members', () => {
    expect(COUNTRY_NAMES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(COUNTRY_NAMES).size).toBe(COUNTRY_NAMES.length);
    for (const name of [
      'estonia',
      'papua new guinea',
      'south sudan',
      'timor leste',
      'eswatini',
      'north macedonia',
      'kiribati',
      'canada',
      'india',
      'germany',
    ]) {
      expect(COUNTRY_NAMES).toContain(name);
    }
  });

  it('stores every name and alias in normalised form', () => {
    for (const row of [
      ...COUNTRY_TABLE,
      ...REGION_TABLE,
      ...EXPANDED_COUNTRY_TABLE,
      ...EXPANDED_REGION_TABLE,
    ]) {
      for (const name of row) {
        expect(name).toBe(normalizeLabel(name));
        expect(name).not.toBe('');
      }
    }
  });

  it('never repeats a name or alias across the whole table, derived forms included', () => {
    const all = [...EXPANDED_COUNTRY_TABLE, ...EXPANDED_REGION_TABLE].flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('derives the and-less form of every name and alias with "and"', () => {
    const base = new Set([...COUNTRY_TABLE, ...REGION_TABLE].flat());
    const expanded = new Set(
      [...EXPANDED_COUNTRY_TABLE, ...EXPANDED_REGION_TABLE].flat(),
    );
    for (const name of base) {
      if (!name.split(' ').includes('and')) continue;
      const derived = name
        .split(' ')
        .filter((word) => word !== 'and')
        .join(' ');
      expect(expanded.has(derived)).toBe(true);
    }
  });
});

describe('countryOf', () => {
  it('reads common spellings of the United States', () => {
    for (const text of [
      'United States',
      'USA',
      'U.S.',
      'us',
      ' United States of America ',
    ]) {
      expect(countryOf(text)).toBe('united states');
    }
  });

  it('reads the United Kingdom', () => {
    expect(countryOf('UK')).toBe('united kingdom');
  });

  it('needs the whole string to be a place', () => {
    expect(countryOf('Texas, USA')).toBeUndefined();
    expect(countryOf('')).toBeUndefined();
    expect(countryOf('EU')).toBeUndefined();
    expect(countryOf('Narnia')).toBeUndefined();
  });

  it.each([
    ['usa', 'united states'],
    ['u s a', 'united states'],
    ['america', 'united states'],
    ['england', 'united kingdom'],
    ['scotland', 'united kingdom'],
    ['wales', 'united kingdom'],
    ['northern ireland', 'united kingdom'],
    ['great britain', 'united kingdom'],
    ['britain', 'united kingdom'],
    ['u k', 'united kingdom'],
    ['uae', 'united arab emirates'],
    ['korea', 'south korea'],
    ['republic of korea', 'south korea'],
    ['russian federation', 'russia'],
    ['czech republic', 'czechia'],
    ['holland', 'netherlands'],
    ['the netherlands', 'netherlands'],
    ['cote d ivoire', 'ivory coast'],
    ['côte d ivoire', 'ivory coast'],
    ['turkiye', 'turkey'],
    ['türkiye', 'turkey'],
    ['burma', 'myanmar'],
    ['the gambia', 'gambia'],
    ['the bahamas', 'bahamas'],
    ['cabo verde', 'cape verde'],
    ['east timor', 'timor leste'],
    ['swaziland', 'eswatini'],
    ['macedonia', 'north macedonia'],
    ['bosnia', 'bosnia and herzegovina'],
    ['st lucia', 'saint lucia'],
    ['holy see', 'vatican city'],
    ['macao', 'macau'],
    ['viet nam', 'vietnam'],
    ['dr congo', 'democratic republic of the congo'],
    ['dprk', 'north korea'],
    ['hong kong', 'hong kong'],
    ['kosovo', 'kosovo'],
    ['taiwan', 'taiwan'],
    ['palestine', 'palestine'],
    ['puerto rico', 'puerto rico'],
    ['vatican city', 'vatican city'],
  ])('reads %s as %s', (text, expected) => {
    expect(countryOf(text)).toBe(expected);
  });

  it.each(REGION_TABLE.flat())(
    'does not read the region %s as a country',
    (name) => {
      expect(countryOf(name)).toBeUndefined();
    },
  );
});

describe('placesNamed', () => {
  it('finds a country', () => {
    expect(placesNamed(PREFIX + 'the united states')).toEqual([
      'united states',
    ]);
    expect(placesNamed(PREFIX + 'estonia')).toEqual(['estonia']);
  });

  it('consumes what it matched', () => {
    expect(placesNamed(PREFIX + 'papua new guinea')).toEqual([
      'papua new guinea',
    ]);
    expect(placesNamed(PREFIX + 'nigeria')).toEqual(['nigeria']);
    expect(placesNamed(PREFIX + 'dominican republic')).toEqual([
      'dominican republic',
    ]);
    expect(placesNamed(PREFIX + 'south sudan')).toEqual(['south sudan']);
    expect(placesNamed(PREFIX + 'equatorial guinea')).toEqual([
      'equatorial guinea',
    ]);
    expect(placesNamed(PREFIX + 'northern ireland')).toEqual([
      'united kingdom',
    ]);
  });

  it('returns several places in order of first appearance, once each', () => {
    expect(placesNamed(PREFIX + 'the us or canada')).toEqual([
      'united states',
      'canada',
    ]);
    expect(placesNamed('canada or the us or canada')).toEqual([
      'canada',
      'united states',
    ]);
    expect(placesNamed('usa or the united states')).toEqual(['united states']);
  });

  it('finds regions', () => {
    expect(placesNamed(PREFIX + 'the eu')).toEqual(['european union']);
    expect(placesNamed(PREFIX + 'the e u')).toEqual(['european union']);
    expect(placesNamed(PREFIX + 'the european economic area')).toEqual(['eea']);
    expect(placesNamed(PREFIX + 'europe')).toEqual(['europe']);
    expect(placesNamed(PREFIX + 'the schengen area')).toEqual(['schengen']);
    expect(placesNamed(PREFIX + 'emea')).toEqual(['emea']);
    expect(placesNamed(PREFIX + 'latin america')).toEqual(['latin america']);
    expect(placesNamed(PREFIX + 'north america')).toEqual(['north america']);
  });

  it('reads continents and regions as themselves, not as a country', () => {
    for (const [text, expected] of [
      ['south america', 'south america'],
      ['central america', 'central america'],
      ['the americas', 'americas'],
      ['asia', 'asia'],
      ['africa', 'africa'],
      ['the middle east', 'middle east'],
      ['oceania', 'oceania'],
      ['the caribbean', 'caribbean'],
      ['asia pacific', 'apac'],
      ['apac', 'apac'],
    ] as const) {
      expect(placesNamed(PREFIX + text)).toEqual([expected]);
    }
  });

  it('keeps a country apart from a region that shares a word', () => {
    expect(placesNamed(PREFIX + 'south africa')).toEqual(['south africa']);
    expect(placesNamed(PREFIX + 'north korea')).toEqual(['north korea']);
    expect(placesNamed(PREFIX + 'korea')).toEqual(['south korea']);
    expect(placesNamed(PREFIX + 'north america or the us')).toEqual([
      'north america',
      'united states',
    ]);
  });

  it('names nothing for a generic question', () => {
    expect(placesNamed(PREFIX + 'this country')).toEqual([]);
    expect(placesNamed('')).toEqual([]);
  });

  it('accepts a known false alarm in the safe direction', () => {
    expect(placesNamed('tell us about yourself')).toEqual(['united states']);
  });

  it('matches whole words only', () => {
    expect(placesNamed('do you use indiana software')).toEqual([]);
    expect(placesNamed('a business')).toEqual([]);
  });

  it.each([
    ['guinea bissau', 'guinea bissau'],
    ['democratic republic of the congo', 'democratic republic of the congo'],
    ['united states of america', 'united states'],
    ['republic of korea', 'south korea'],
    ['dr congo', 'democratic republic of the congo'],
    ['democratic republic of congo', 'democratic republic of the congo'],
    ['korea democratic people s republic of', 'north korea'],
    ['korea republic of', 'south korea'],
    ['congo democratic republic of the', 'democratic republic of the congo'],
    ['congo republic of the', 'congo'],
  ])('names only one place in %s', (text, expected) => {
    expect(placesNamed(text)).toEqual([expected]);
  });

  it('reads a european country as Europe, and the union as the union', () => {
    expect(placesNamed(PREFIX + 'a european country')).toEqual(['europe']);
    expect(placesNamed(PREFIX + 'the european union')).toEqual([
      'european union',
    ]);
  });
});

describe('spellings without "and" and other added aliases', () => {
  it.each([
    ['trinidad tobago', 'trinidad and tobago'],
    ['antigua barbuda', 'antigua and barbuda'],
    ['saint kitts nevis', 'saint kitts and nevis'],
    ['saint vincent the grenadines', 'saint vincent and the grenadines'],
    ['sao tome principe', 'sao tome and principe'],
    ['bosnia herzegovina', 'bosnia and herzegovina'],
    ['st kitts and nevis', 'saint kitts and nevis'],
    ['st kitts nevis', 'saint kitts and nevis'],
    ['st lucia', 'saint lucia'],
    ['st vincent and the grenadines', 'saint vincent and the grenadines'],
    ['st vincent the grenadines', 'saint vincent and the grenadines'],
    ['u a e', 'united arab emirates'],
    ['drc', 'democratic republic of the congo'],
    ['d r c', 'democratic republic of the congo'],
    ['democratic republic of congo', 'democratic republic of the congo'],
    ['dr congo', 'democratic republic of the congo'],
    ['congo kinshasa', 'democratic republic of the congo'],
    ['congo brazzaville', 'congo'],
    ['kyrgyz republic', 'kyrgyzstan'],
    ['slovak republic', 'slovakia'],
    ['lao pdr', 'laos'],
    ['lao people s democratic republic', 'laos'],
    ['syrian arab republic', 'syria'],
    ['são tomé and príncipe', 'sao tome and principe'],
    ['korea democratic people s republic of', 'north korea'],
    ['korea republic of', 'south korea'],
    ['congo democratic republic of the', 'democratic republic of the congo'],
    ['congo republic of the', 'congo'],
    ['brunei darussalam', 'brunei'],
    ['federated states of micronesia', 'micronesia'],
    ['state of palestine', 'palestine'],
    ['vatican', 'vatican city'],
    ['republic of the congo', 'congo'],
    ['democratic people s republic of korea', 'north korea'],
  ])('reads %s as %s in both lookups', (text, expected) => {
    expect(countryOf(text)).toBe(expected);
    expect(placesNamed(PREFIX + text)).toEqual([expected]);
  });

  it('reads european as a region only', () => {
    expect(countryOf('European')).toBeUndefined();
  });

  it('ignores a leading "the" when reading a country', () => {
    expect(countryOf('The United States')).toBe('united states');
    expect(countryOf('the UK')).toBe('united kingdom');
    expect(countryOf('The Netherlands')).toBe('netherlands');
    expect(countryOf('The Gambia')).toBe('gambia');
    expect(countryOf('the')).toBeUndefined();
    expect(countryOf('The European Union')).toBeUndefined();
  });
});
