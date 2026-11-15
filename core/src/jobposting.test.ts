import { describe, expect, it } from 'vitest';
import { postingFromJsonLd } from './jobposting';

const posting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: '  Staff Widget Engineer ',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Widgets' },
  jobLocation: {
    address: { addressLocality: 'Springfield', addressRegion: 'IL' },
  },
  description: '<p>Build widgets.</p>',
};

describe('postingFromJsonLd', () => {
  it('reads a plain block', () => {
    expect(postingFromJsonLd([JSON.stringify(posting)])).toEqual({
      title: 'Staff Widget Engineer',
      companyName: 'Acme Widgets',
      location: 'Springfield, IL',
      descriptionHtml: '<p>Build widgets.</p>',
    });
  });

  it('finds a posting inside @graph', () => {
    const block = JSON.stringify({
      '@graph': [{ '@type': 'Organization', name: 'Other Co' }, posting],
    });
    expect(postingFromJsonLd([block])?.companyName).toBe('Acme Widgets');
  });

  it('finds a posting in an array of values', () => {
    const block = JSON.stringify([{ '@type': 'WebSite' }, posting]);
    expect(postingFromJsonLd([block])?.title).toBe('Staff Widget Engineer');
  });

  it('skips a malformed block', () => {
    const result = postingFromJsonLd(['{not json', JSON.stringify(posting)]);
    expect(result?.title).toBe('Staff Widget Engineer');
  });

  it('ignores wrong-typed fields without throwing', () => {
    const block = JSON.stringify({
      '@type': 'JobPosting',
      title: 42,
      hiringOrganization: { name: ['x'] },
      jobLocation: null,
      description: { a: 1 },
    });
    expect(postingFromJsonLd([block])).toEqual({});
  });

  it('accepts hiringOrganization as a string and jobLocation as an array', () => {
    const block = JSON.stringify({
      '@type': 'JobPosting',
      hiringOrganization: ' Beta Corp ',
      jobLocation: [
        { address: { addressRegion: 'Ohio' } },
        { address: { addressLocality: 'X' } },
      ],
    });
    expect(postingFromJsonLd([block])).toEqual({
      companyName: 'Beta Corp',
      location: 'Ohio',
    });
  });

  it('treats blank strings as absent', () => {
    const block = JSON.stringify({
      '@type': 'JobPosting',
      title: '   ',
      jobLocation: { address: { addressLocality: ' ', addressRegion: '' } },
    });
    expect(postingFromJsonLd([block])).toEqual({});
  });

  it('returns undefined when there is no JobPosting', () => {
    expect(
      postingFromJsonLd([
        JSON.stringify({ '@type': 'Organization' }),
        'null',
        '42',
      ]),
    ).toBeUndefined();
    expect(postingFromJsonLd([])).toBeUndefined();
  });

  it('matches @type given as an array', () => {
    const block = JSON.stringify({
      '@type': ['JobPosting', 'Thing'],
      title: 'T',
    });
    expect(postingFromJsonLd([block])).toEqual({ title: 'T' });
  });

  it('first candidate wins and depth is limited', () => {
    const first = { '@type': 'JobPosting', title: 'First' };
    const second = { '@type': 'JobPosting', title: 'Second' };
    expect(postingFromJsonLd([JSON.stringify([first, second])])?.title).toBe(
      'First',
    );
    const deep = [[[[{ '@type': 'JobPosting', title: 'Deep' }]]]];
    expect(postingFromJsonLd([JSON.stringify(deep)])).toBeUndefined();
    const ok = [[[{ '@type': 'JobPosting', title: 'Ok' }]]];
    expect(postingFromJsonLd([JSON.stringify(ok)])?.title).toBe('Ok');
  });
});
