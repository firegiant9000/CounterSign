import { describe, expect, it } from 'vitest';
import { newApplicationFromFormOps } from './form-application';
import { formUrlKey } from './form-link';
import type { FillResult } from './fill/result';
import type { WriteOp } from './repository';
import { emptySnapshot } from './schema';
import type { Application, Job, Statement, StatusEvent } from './types';

const T = '2026-01-01T00:00:00.000Z';
const URL = 'https://jobs.lever.co/acme/1/apply';

function makeDeps() {
  let n = 0;
  return { now: () => T, newId: () => `n${(n += 1)}` };
}

function held(siteType: FillResult['siteType'] = 'other'): FillResult {
  return {
    url: URL,
    siteType,
    at: T,
    rows: [
      {
        label: 'Need sponsorship?',
        target: { kind: 'answer', key: 'sponsorship' },
        status: 'will_fill',
        outcome: 'written',
        answerValue: { type: 'yes_no', value: true },
      },
      {
        label: 'Relocate?',
        target: { kind: 'answer', key: 'relocation' },
        status: 'matches',
        answerValue: { type: 'yes_no', value: false },
      },
    ],
  };
}

function stores(ops: WriteOp[], store: string): WriteOp[] {
  return ops.filter((o) => o.kind === 'put' && o.store === store);
}

describe('newApplicationFromFormOps', () => {
  it('makes one job and one linked interested application', () => {
    const { ops, applicationId, record } = newApplicationFromFormOps(
      emptySnapshot(),
      { source: 'paste', url: URL, title: 'Dev', companyName: 'Acme' },
      makeDeps(),
    );
    const jobs = stores(ops, 'jobs');
    const apps = stores(ops, 'applications');
    expect(jobs).toHaveLength(1);
    expect(apps).toHaveLength(1);
    const job = (jobs[0] as { record: Job }).record;
    const app = (apps[0] as { record: Application }).record;
    expect(app.jobId).toBe(job.id);
    expect(app.id).toBe(applicationId);
    const ev = (stores(ops, 'statusEvents')[0] as { record: StatusEvent })
      .record;
    expect(ev.applicationId).toBe(app.id);
    expect(ev.status).toBe('interested');
    expect(record).toBeUndefined();
  });

  it('keys the job by the form url key', () => {
    const { ops } = newApplicationFromFormOps(
      emptySnapshot(),
      { source: 'paste', url: URL },
      makeDeps(),
    );
    const job = (stores(ops, 'jobs')[0] as { record: Job }).record;
    expect(job.canonicalUrl).toBe(formUrlKey(URL));
    expect(job.canonicalUrl).toBeDefined();
  });

  it('orders company, job, application, status event', () => {
    const { ops } = newApplicationFromFormOps(
      emptySnapshot(),
      { source: 'paste', url: URL, title: 'Dev', companyName: 'Acme' },
      makeDeps(),
    );
    const order = ops.map((o) => (o.kind === 'put' ? o.store : o.kind));
    expect(order).toEqual([
      'companies',
      'jobs',
      'applications',
      'statusEvents',
    ]);
  });

  it('records held statements against the new application', () => {
    const { ops, applicationId, record } = newApplicationFromFormOps(
      emptySnapshot(),
      { source: 'paste', url: URL, title: 'Dev', companyName: 'Acme' },
      makeDeps(),
      held(),
    );
    expect(record?.recorded).toBe(2);
    expect(record?.alreadyOnForm).toBe(1);
    const statements = stores(ops, 'statements').map(
      (o) => (o as { record: Statement }).record,
    );
    expect(statements).toHaveLength(2);
    expect(statements.every((s) => s.applicationId === applicationId)).toBe(
      true,
    );
    const order = ops.map((o) => (o.kind === 'put' ? o.store : o.kind));
    expect(order.indexOf('statements')).toBeGreaterThan(
      order.indexOf('statusEvents'),
    );
  });

  it('keeps jobId on the last applications put when the site type is set', () => {
    const { ops } = newApplicationFromFormOps(
      emptySnapshot(),
      { source: 'paste', url: URL, title: 'Dev', companyName: 'Acme' },
      makeDeps(),
      held('lever'),
    );
    const job = (stores(ops, 'jobs')[0] as { record: Job }).record;
    const apps = stores(ops, 'applications');
    expect(apps.length).toBeGreaterThan(1);
    const last = (apps[apps.length - 1] as { record: Application }).record;
    expect(last.jobId).toBe(job.id);
    expect(last.siteType).toBe('lever');
  });

  it('accepts a blank title and company and does not mutate data', () => {
    const data = emptySnapshot();
    const { ops, record } = newApplicationFromFormOps(
      data,
      { source: 'paste', url: URL, title: '  ', companyName: '' },
      makeDeps(),
      held(),
    );
    expect(stores(ops, 'applications')).toHaveLength(1);
    expect(stores(ops, 'companies')).toHaveLength(0);
    expect(record?.missing).toBe(false);
    expect(data.jobs).toHaveLength(0);
    expect(data.applications).toHaveLength(0);
    expect(data.statusEvents).toHaveLength(0);
  });
});
