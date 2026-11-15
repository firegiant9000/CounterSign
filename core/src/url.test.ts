import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from './url';

describe('canonicalizeUrl', () => {
  it('removes fragment and utm parameters, matching names case-insensitively', () => {
    expect(
      canonicalizeUrl(
        'https://example.com/jobs/1?utm_source=x&utm_Medium=y#apply',
      ),
    ).toBe('https://example.com/jobs/1');
  });

  it.each([
    'gclid',
    'fbclid',
    'msclkid',
    'mc_cid',
    'mc_eid',
    'gh_src',
    'lever-source',
    'source',
    'src',
    'ref',
    'refid',
    'trk',
    'trackingid',
  ])('removes the tracking parameter %s', (name) => {
    expect(canonicalizeUrl(`https://example.com/j?keep=1&${name}=abc`)).toBe(
      'https://example.com/j?keep=1',
    );
    expect(
      canonicalizeUrl(`https://example.com/j?${name.toUpperCase()}=abc`),
    ).toBe('https://example.com/j');
  });

  it('keeps the order of the remaining parameters', () => {
    expect(canonicalizeUrl('https://example.com/jobs?b=2&gclid=z&a=1')).toBe(
      'https://example.com/jobs?b=2&a=1',
    );
  });

  it('keeps gh_jid while removing gh_src', () => {
    expect(canonicalizeUrl('https://example.com/j?gh_jid=123&gh_src=abc')).toBe(
      'https://example.com/j?gh_jid=123',
    );
  });

  it('uses an absolute rel=canonical as the base result', () => {
    expect(
      canonicalizeUrl(
        'https://example.com/a?ref=x',
        'https://example.com/jobs/9',
      ),
    ).toBe('https://example.com/jobs/9');
  });

  it('resolves a relative rel=canonical against the url and drops its fragment', () => {
    expect(canonicalizeUrl('https://example.com/a/b?x=1', '/jobs/9#top')).toBe(
      'https://example.com/jobs/9',
    );
  });

  it.each(['javascript:void(0)', '', '   '])(
    'ignores a blank or non-http rel=canonical (%j)',
    (relCanonical) => {
      expect(canonicalizeUrl('https://example.com/a?x=1#f', relCanonical)).toBe(
        'https://example.com/a?x=1',
      );
    },
  );

  it('returns non-URL input trimmed and unchanged', () => {
    expect(canonicalizeUrl('  pasted text  ')).toBe('pasted text');
  });

  it('returns a non-http(s) URL unchanged', () => {
    expect(canonicalizeUrl('ftp://example.com/x')).toBe('ftp://example.com/x');
  });
});
