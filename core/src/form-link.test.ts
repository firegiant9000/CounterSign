import { describe, expect, it } from 'vitest';
import {
  MAX_FORM_URLS,
  findApplicationsForForm,
  formUrlKey,
  linkFormOps,
} from './form-link';
import { emptySnapshot } from './schema';
import type { Application, Job, Snapshot, StatusEvent } from './types';
import { canonicalizeUrl } from './url';

const AT = 'T12:00:00.000Z';

function snap(parts: {
  applications?: Application[];
  jobs?: Job[];
  statusEvents?: StatusEvent[];
}): Snapshot {
  return { ...emptySnapshot(), ...parts };
}

function app(id: string, day: string, extra: object = {}): Application {
  return { id, createdAt: `2026-01-${day}${AT}`, ...extra };
}

const KEY = 'https://example.com/jobs/1';

describe('formUrlKey', () => {
  it('ignores an address longer than the capture cap', () => {
    const long = `https://example.com/${'a'.repeat(8_001 - 20)}`;
    expect(long).toHaveLength(8_001);
    expect(formUrlKey(long)).toBeUndefined();
    expect(formUrlKey('https://example.com/jobs/1')).toBe(
      'https://example.com/jobs/1',
    );
  });

  it('strips the Lever apply segment', () => {
    expect(formUrlKey('https://jobs.lever.co/acme/123/apply')).toBe(
      formUrlKey('https://jobs.lever.co/acme/123'),
    );
    expect(formUrlKey('https://jobs.eu.lever.co/acme/123/apply/')).toBe(
      formUrlKey('https://jobs.eu.lever.co/acme/123'),
    );
  });

  it('strips the Ashby application segment', () => {
    expect(formUrlKey('https://jobs.ashbyhq.com/acme/abc/application')).toBe(
      formUrlKey('https://jobs.ashbyhq.com/acme/abc'),
    );
  });

  it('otherwise equals canonicalizeUrl', () => {
    const url = 'https://job-boards.greenhouse.io/acme/jobs/9?gh_src=x#app';
    expect(formUrlKey(url)).toBe(canonicalizeUrl(url));
  });

  it('leaves other hosts and other segments alone', () => {
    expect(formUrlKey('https://example.com/careers/apply')).toBe(
      'https://example.com/careers/apply',
    );
    expect(formUrlKey('https://jobs.lever.co/acme/applyx')).toBe(
      'https://jobs.lever.co/acme/applyx',
    );
  });

  it('is undefined for non-http(s) and unparseable input', () => {
    expect(formUrlKey('not a url')).toBeUndefined();
    expect(formUrlKey('javascript:alert(1)')).toBeUndefined();
    expect(formUrlKey('')).toBeUndefined();
  });
});

describe('findApplicationsForForm', () => {
  it('matches by formUrls, job canonicalUrl and own url', () => {
    const data = snap({
      jobs: [{ id: 'j1', createdAt: `2026-01-01${AT}`, canonicalUrl: KEY }],
      applications: [
        app('a1', '02', { formUrls: [KEY] }),
        app('a2', '03', { jobId: 'j1' }),
        app('a3', '04', { url: `${KEY}?utm_source=x` }),
        app('a4', '05', { url: 'https://example.com/other' }),
      ],
    });
    expect(findApplicationsForForm(data, KEY)).toEqual(['a1', 'a2', 'a3']);
  });

  it('ranks a formUrls match before a newer job match', () => {
    const data = snap({
      jobs: [{ id: 'j1', createdAt: `2026-01-01${AT}`, canonicalUrl: KEY }],
      applications: [
        app('old', '02', { formUrls: [KEY] }),
        app('new', '09', { jobId: 'j1' }),
      ],
    });
    expect(findApplicationsForForm(data, KEY)).toEqual(['old', 'new']);
  });

  it('orders newest first within a group and does not duplicate', () => {
    const data = snap({
      applications: [
        app('a1', '02', { formUrls: [KEY], url: KEY }),
        app('a2', '08', { formUrls: [KEY] }),
      ],
    });
    expect(findApplicationsForForm(data, KEY)).toEqual(['a2', 'a1']);
  });

  it('excludes archived applications', () => {
    const data = snap({
      applications: [app('a1', '02', { formUrls: [KEY] })],
      statusEvents: [
        {
          id: 'e1',
          createdAt: `2026-01-03${AT}`,
          applicationId: 'a1',
          status: 'rejected',
        },
      ],
    });
    expect(findApplicationsForForm(data, KEY)).toEqual([]);
  });

  it('tolerates odd formUrls', () => {
    const data = snap({
      applications: [
        app('a1', '02', { formUrls: 'x' }),
        app('a2', '03', { formUrls: [3, null] }),
        app('a3', '04', { formUrls: null }),
      ],
    });
    expect(findApplicationsForForm(data, KEY)).toEqual([]);
    expect(findApplicationsForForm(data, 'x')).toEqual([]);
  });

  it('matches a job saved from the Lever apply page', () => {
    const applyUrl = 'https://jobs.lever.co/acme/123/apply';
    const data = snap({
      jobs: [
        { id: 'j1', createdAt: `2026-01-01${AT}`, canonicalUrl: applyUrl },
      ],
      applications: [app('a1', '02', { jobId: 'j1' })],
    });
    expect(
      findApplicationsForForm(data, formUrlKey(applyUrl) as string),
    ).toEqual(['a1']);
  });
});

describe('linkFormOps', () => {
  function put(ops: ReturnType<typeof linkFormOps>, id: string): Application {
    const op = ops.find(
      (o) => o.kind === 'put' && (o.record as Application).id === id,
    );
    return (op as { record: Application }).record;
  }

  it('adds the key once', () => {
    const data = snap({ applications: [app('a1', '02')] });
    const ops = linkFormOps(data, 'a1', KEY);
    expect(ops).toHaveLength(1);
    expect(put(ops, 'a1').formUrls).toEqual([KEY]);
  });

  it('returns nothing the second time', () => {
    const data = snap({ applications: [app('a1', '02', { formUrls: [KEY] })] });
    expect(linkFormOps(data, 'a1', KEY)).toEqual([]);
  });

  it('moves the key from one application to another', () => {
    const data = snap({
      applications: [
        app('a', '02'),
        app('b', '03', { formUrls: [KEY], title: 'B' }),
      ],
    });
    const ops = linkFormOps(data, 'a', KEY);
    expect(ops).toHaveLength(2);
    expect(put(ops, 'a').formUrls).toEqual([KEY]);
    const b = put(ops, 'b');
    expect('formUrls' in b).toBe(false);
    expect(b.title).toBe('B');
  });

  it('keeps the other keys on the application it removes from', () => {
    const data = snap({
      applications: [
        app('a', '02'),
        app('b', '03', { formUrls: ['https://example.com/x', KEY] }),
      ],
    });
    expect(put(linkFormOps(data, 'a', KEY), 'b').formUrls).toEqual([
      'https://example.com/x',
    ]);
  });

  it('drops the oldest past the cap and non-strings', () => {
    const existing = Array.from(
      { length: MAX_FORM_URLS },
      (_, i) => `https://example.com/k${i}`,
    );
    const data = snap({
      applications: [app('a', '02', { formUrls: [...existing, 7, null] })],
    });
    const urls = put(linkFormOps(data, 'a', KEY), 'a').formUrls;
    expect(urls).toHaveLength(MAX_FORM_URLS);
    expect(urls?.[0]).toBe('https://example.com/k1');
    expect(urls?.at(-1)).toBe(KEY);
  });

  it('returns nothing for a missing application', () => {
    expect(linkFormOps(snap({}), 'nope', KEY)).toEqual([]);
  });

  it('survives a non-array formUrls', () => {
    const data = snap({ applications: [app('a', '02', { formUrls: 'x' })] });
    expect(put(linkFormOps(data, 'a', KEY), 'a').formUrls).toEqual([KEY]);
  });
});
