import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import { createApplicationFromJobOps, saveJobOps } from './job-ops';
import { MAX_POSTING_TEXT } from './jobposting';
import { emptySnapshot } from './schema';
import type { Job } from './types';

const T = '2026-01-05T09:00:00.000Z';

function putRecord(
  ops: { kind: string; store: string; record?: unknown }[],
  store: string,
) {
  const op = ops.find((o) => o.kind === 'put' && o.store === store);
  return op?.record as Record<string, unknown> | undefined;
}

describe('saveJobOps', () => {
  it('writes exactly one job put with the canonical URL', () => {
    const { ops, jobId } = saveJobOps(
      {
        source: 'paste',
        url: 'https://example.com/jobs/1?utm_source=x&id=7#apply',
        title: 'Engineer',
      },
      fixedDeps(),
    );
    expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual(['put:jobs']);
    const job = putRecord(ops, 'jobs');
    expect(job?.id).toBe(jobId);
    expect(job?.createdAt).toBe(T);
    expect(job?.source).toBe('paste');
    expect(job?.url).toBe('https://example.com/jobs/1?utm_source=x&id=7#apply');
    expect(job?.canonicalUrl).toBe('https://example.com/jobs/1?id=7');
  });

  it('drops blank fields and omits canonicalUrl when there is no URL', () => {
    const { ops } = saveJobOps(
      {
        source: 'selection',
        url: '   ',
        title: '  ',
        companyName: '',
        location: ' ',
        text: '\n',
      },
      fixedDeps(),
    );
    const job = putRecord(ops, 'jobs') ?? {};
    expect(job).not.toHaveProperty('url');
    expect(job).not.toHaveProperty('canonicalUrl');
    expect(job).not.toHaveProperty('title');
    expect(job).not.toHaveProperty('companyName');
    expect(job).not.toHaveProperty('location');
    expect(job).not.toHaveProperty('text');
  });

  it('trims string fields', () => {
    const { ops } = saveJobOps(
      {
        source: 'jsonld',
        title: '  Engineer  ',
        companyName: ' Example Robotics ',
        location: ' Remote ',
      },
      fixedDeps(),
    );
    const job = putRecord(ops, 'jobs');
    expect(job?.title).toBe('Engineer');
    expect(job?.companyName).toBe('Example Robotics');
    expect(job?.location).toBe('Remote');
  });

  it('caps text at MAX_POSTING_TEXT', () => {
    const { ops } = saveJobOps(
      {
        source: 'paste',
        text: 'a'.repeat(MAX_POSTING_TEXT + 50),
      },
      fixedDeps(),
    );
    const job = putRecord(ops, 'jobs');
    expect(job?.text).toHaveLength(MAX_POSTING_TEXT);
  });

  it('uses relCanonical for the canonical URL and stores it trimmed', () => {
    const { ops } = saveJobOps(
      {
        source: 'jsonld',
        url: 'https://example.com/jobs/1?utm_source=x',
        relCanonical: '  https://example.com/jobs/42  ',
      },
      fixedDeps(),
    );
    const job = putRecord(ops, 'jobs');
    expect(job?.canonicalUrl).toBe('https://example.com/jobs/42');
    expect(job?.relCanonical).toBe('https://example.com/jobs/42');
  });

  it('omits a blank relCanonical', () => {
    const { ops } = saveJobOps(
      {
        source: 'jsonld',
        url: 'https://example.com/jobs/1',
        relCanonical: '  ',
      },
      fixedDeps(),
    );
    expect(putRecord(ops, 'jobs')).not.toHaveProperty('relCanonical');
  });
});

describe('createApplicationFromJobOps', () => {
  it('reuses an existing company typed in another case, sets jobId and adds an interested event', () => {
    const data = {
      ...emptySnapshot(),
      companies: [{ id: 'c1', createdAt: T, name: 'Example Robotics' }],
    };
    const job: Job = {
      id: 'j1',
      createdAt: T,
      companyName: 'example   ROBOTICS',
      title: 'Engineer',
      url: 'https://example.com/jobs/1',
      source: 'paste',
    };
    const { ops, applicationId } = createApplicationFromJobOps(
      job,
      data,
      fixedDeps(),
    );
    expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual([
      'put:applications',
      'put:statusEvents',
    ]);
    const app = putRecord(ops, 'applications');
    const event = putRecord(ops, 'statusEvents');
    expect(app?.id).toBe(applicationId);
    expect(app?.companyId).toBe('c1');
    expect(app?.jobId).toBe('j1');
    expect(app?.title).toBe('Engineer');
    expect(app?.url).toBe('https://example.com/jobs/1');
    expect(event?.applicationId).toBe(applicationId);
    expect(event?.status).toBe('interested');
  });

  it('works for a job with no company, title or url', () => {
    const job: Job = { id: 'j2', createdAt: T, source: 'selection' };
    const { ops } = createApplicationFromJobOps(
      job,
      emptySnapshot(),
      fixedDeps(),
    );
    const app = putRecord(ops, 'applications');
    expect(app?.jobId).toBe('j2');
    expect(app).not.toHaveProperty('companyId');
    expect(app).not.toHaveProperty('url');
    expect(ops.some((o) => o.store === 'companies')).toBe(false);
  });
});
