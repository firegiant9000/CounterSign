import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import { applicationRows } from './application-list';
import { anyoneHerePrompt } from './contacts';
import { isLocalDate } from './dates';
import {
  buildDemoOps,
  canLoadDemo,
  DEMO_PREFIX,
  hasDemoData,
  removeDemoOps,
} from './demo';
import { buildExport, parseExport } from './export';
import { createMemoryRepository } from './memory-repository';
import { emptySnapshot } from './schema';
import { STATUS_KEYS } from './status';

const T = '2026-01-05T09:00:00.000Z';
const TODAY = '2026-11-14';

async function demoSnapshot() {
  const repo = createMemoryRepository();
  await repo.apply(buildDemoOps(TODAY, fixedDeps()));
  return { repo, snap: await repo.snapshot() };
}

describe('demo data', () => {
  it('marks every demo record', () => {
    const ops = buildDemoOps(TODAY, fixedDeps());
    expect(ops.length).toBeGreaterThan(0);
    expect(
      ops.every((o) => o.kind === 'put' && o.record.id.startsWith('demo-')),
    ).toBe(true);
  });

  it('uses only example.com addresses', async () => {
    const { snap } = await demoSnapshot();
    expect(snap.applications).toHaveLength(10);
    for (const app of snap.applications) {
      expect(app.url?.startsWith('https://example.com/')).toBe(true);
    }
  });

  it('shows active and archived applications', async () => {
    const { snap } = await demoSnapshot();
    const rows = applicationRows(snap);
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.archived).length).toBeGreaterThanOrEqual(2);
    expect(rows.filter((r) => !r.archived).length).toBeGreaterThanOrEqual(4);
  });

  it('passes export validation', async () => {
    const { snap } = await demoSnapshot();
    const text = JSON.stringify(buildExport(snap, {}, { now: () => T }));
    const parsed = parseExport(text);
    expect(parsed.ok).toBe(true);
  });

  it('loads only into an empty tracker', () => {
    expect(canLoadDemo(emptySnapshot())).toBe(true);
    expect(
      canLoadDemo({
        ...emptySnapshot(),
        companies: [{ id: 'c1', createdAt: T }],
      }),
    ).toBe(false);
    expect(
      canLoadDemo({
        ...emptySnapshot(),
        applications: [{ id: 'a1', createdAt: T }],
      }),
    ).toBe(false);
  });

  it('removes demo records and nothing else', async () => {
    const { repo } = await demoSnapshot();
    await repo.apply([
      { kind: 'put', store: 'companies', record: { id: 'c1', createdAt: T } },
      {
        kind: 'put',
        store: 'applications',
        record: { id: 'a1', createdAt: T, companyId: 'c1' },
      },
    ]);
    const before = await repo.snapshot();
    expect(hasDemoData(before)).toBe(true);
    await repo.apply(removeDemoOps(before));
    const after = await repo.snapshot();
    expect(after.companies.map((c) => c.id)).toEqual(['c1']);
    expect(after.applications.map((a) => a.id)).toEqual(['a1']);
    expect(after.statusEvents).toEqual([]);
    expect(after.documents).toEqual([]);
    expect(hasDemoData(after)).toBe(false);
  });

  it('keeps a demo company or document that a real application still uses', async () => {
    const { repo, snap } = await demoSnapshot();
    const demoCompany = snap.companies[0];
    const demoDoc = snap.documents[0];
    const demoCover = snap.documents[1];
    if (!demoCompany || !demoDoc || !demoCover) throw new Error('no demo data');
    await repo.apply([
      {
        kind: 'put',
        store: 'applications',
        record: {
          id: 'real-1',
          createdAt: T,
          companyId: demoCompany.id,
          resumeDocumentId: demoDoc.id,
          coverLetterDocumentId: demoCover.id,
        },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    const after = await repo.snapshot();
    expect(after.companies.map((c) => c.id)).toEqual([demoCompany.id]);
    expect(after.documents.map((d) => d.id).sort()).toEqual(
      [demoDoc.id, demoCover.id].sort(),
    );
    expect(after.applications.map((a) => a.id)).toEqual(['real-1']);
    expect(after.statusEvents).toEqual([]);
  });

  it('is well formed: dates, statuses, hashes, ids', async () => {
    const { snap } = await demoSnapshot();
    const seen = new Set<string>();
    for (const e of snap.statusEvents) {
      expect(isLocalDate(e.occurredOn ?? '')).toBe(true);
      if (e.status) seen.add(e.status);
    }
    for (const app of snap.applications) {
      if (app.nextActionDate !== undefined) {
        expect(isLocalDate(app.nextActionDate)).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual([...STATUS_KEYS].sort());
    expect(snap.companies).toHaveLength(4);
    expect(snap.documents).toHaveLength(2);
    for (const d of snap.documents) {
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const perApp = new Map<string, number>();
    for (const e of snap.statusEvents) {
      perApp.set(
        e.applicationId ?? '',
        (perApp.get(e.applicationId ?? '') ?? 0) + 1,
      );
    }
    for (const n of perApp.values()) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
    expect(DEMO_PREFIX).toBe('demo-');
  });

  it('removes user-added records that hang off a demo application', async () => {
    const { repo, snap } = await demoSnapshot();
    const app = snap.applications[0];
    if (!app) throw new Error('no demo data');
    await repo.apply([
      {
        kind: 'put',
        store: 'documents',
        record: { id: 'uuid-doc-1', createdAt: T, label: 'Mine' },
      },
      {
        kind: 'put',
        store: 'documents',
        record: { id: 'uuid-doc-2', createdAt: T, label: 'Shared' },
      },
      {
        kind: 'put',
        store: 'documents',
        record: { id: 'uuid-doc-3', createdAt: T, label: 'Unrelated' },
      },
      {
        kind: 'put',
        store: 'applications',
        record: { ...app, coverLetterDocumentId: 'uuid-doc-1' },
      },
      {
        kind: 'put',
        store: 'applications',
        record: {
          id: 'real-1',
          createdAt: T,
          resumeDocumentId: 'uuid-doc-2',
        },
      },
      {
        kind: 'put',
        store: 'statusEvents',
        record: {
          id: 'uuid-event-1',
          createdAt: T,
          applicationId: app.id,
          status: 'interview',
        },
      },
    ]);
    // A demo app also using the shared document.
    const second = snap.applications[1];
    if (!second) throw new Error('no demo data');
    await repo.apply([
      {
        kind: 'put',
        store: 'applications',
        record: { ...second, resumeDocumentId: 'uuid-doc-2' },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    const after = await repo.snapshot();
    expect(after.statusEvents).toEqual([]);
    expect(after.documents.map((d) => d.id).sort()).toEqual([
      'uuid-doc-2',
      'uuid-doc-3',
    ]);
    expect(after.applications.map((a) => a.id)).toEqual(['real-1']);
  });

  it('removes statements on demo applications and keeps others', async () => {
    const { repo, snap } = await demoSnapshot();
    const app = snap.applications[0];
    if (!app) throw new Error('no demo data');
    await repo.apply([
      {
        kind: 'put',
        store: 'applications',
        record: { id: 'real-1', createdAt: T },
      },
      {
        kind: 'put',
        store: 'statements',
        record: { id: 'uuid-st-1', createdAt: T, applicationId: app.id },
      },
      {
        kind: 'put',
        store: 'statements',
        record: { id: 'demo-st-2', createdAt: T, applicationId: 'real-1' },
      },
      {
        kind: 'put',
        store: 'statements',
        record: { id: 'uuid-st-3', createdAt: T, applicationId: 'real-1' },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    const after = await repo.snapshot();
    expect(after.statements.map((s) => s.id)).toEqual(['uuid-st-3']);
  });

  it('computes dates across a year boundary', () => {
    const ops = buildDemoOps('2026-01-02', fixedDeps());
    const event = ops.find(
      (o) =>
        o.kind === 'put' &&
        o.store === 'statusEvents' &&
        o.record.id === 'demo-application-1-event-1',
    );
    const app = ops.find(
      (o) =>
        o.kind === 'put' &&
        o.store === 'applications' &&
        o.record.id === 'demo-application-1',
    );
    expect(event?.kind === 'put' && event.record).toMatchObject({
      occurredOn: '2025-12-24',
    });
    expect(app?.kind === 'put' && app.record).toMatchObject({
      nextActionDate: '2026-01-05',
    });
  });

  it('writes the stage 2 demo records', async () => {
    const { snap } = await demoSnapshot();
    expect(snap.companies.find((c) => c.id === 'demo-company-2')).toMatchObject(
      { anyoneHere: 'checked_nobody' },
    );
    expect(snap.contacts).toHaveLength(2);
    expect(snap.contacts.find((c) => c.id === 'demo-contact-1')).toMatchObject({
      name: 'Sample Recruiter',
      role: 'Recruiter',
      howKnown: 'Met at a meetup',
      companyId: 'demo-company-1',
    });
    expect(snap.contacts.find((c) => c.id === 'demo-contact-2')).toMatchObject({
      name: 'Sample Engineer',
      role: 'Engineer',
      howKnown: 'Former colleague',
      companyId: 'demo-company-3',
    });
    expect(snap.tasks.find((t) => t.id === 'demo-task-1')).toMatchObject({
      title: 'Update the sample portfolio',
      dueOn: '2026-11-16',
    });
    const done = snap.tasks.find((t) => t.id === 'demo-task-2');
    expect(done?.title).toBe('Sample finished task');
    expect(typeof done?.doneAt).toBe('string');
    expect(snap.tasks.find((t) => t.id === 'demo-task-1')?.doneAt).toBe(
      undefined,
    );
    expect(
      snap.statements.find((s) => s.id === 'demo-statement-1'),
    ).toMatchObject({
      applicationId: 'demo-application-2',
      answerKey: 'salary_range',
      value: {
        type: 'money_range',
        min: 95000,
        currency: 'USD',
        period: 'year',
      },
    });
    expect(
      snap.statements.find((s) => s.id === 'demo-statement-2'),
    ).toMatchObject({
      applicationId: 'demo-application-3',
      answerKey: 'earliest_start_date',
      value: { type: 'date', value: '2026-11-24' },
    });
    const byId = (id: string) => snap.applications.find((a) => a.id === id);
    expect(byId('demo-application-1')).toMatchObject({
      siteType: 'greenhouse',
      fillOutcome: 'worked',
    });
    expect(byId('demo-application-2')).toMatchObject({
      siteType: 'workday',
      fillOutcome: 'partly',
      fillNote: 'Sample note: the address step was skipped.',
    });
    expect(byId('demo-application-10')).toMatchObject({
      title: 'Sample QA Analyst',
      companyId: 'demo-company-4',
    });
    expect(snap.profileFields).toEqual([]);
    for (const store of ['contacts', 'tasks', 'statements'] as const) {
      for (const r of snap[store]) expect(r.id.startsWith('demo-')).toBe(true);
    }
  });

  it('keeps a demo company the user added a contact to', async () => {
    const { repo } = await demoSnapshot();
    await repo.apply([
      {
        kind: 'put',
        store: 'contacts',
        record: { id: 'real-c1', createdAt: T, companyId: 'demo-company-4' },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    const after = await repo.snapshot();
    expect(after.companies.map((c) => c.id)).toEqual(['demo-company-4']);
    expect(after.contacts.map((c) => c.id)).toEqual(['real-c1']);
    expect(after.applications).toEqual([]);
    expect(after.statusEvents).toEqual([]);
    expect(after.statements).toEqual([]);
    expect(after.tasks).toEqual([]);
    expect(after.documents).toEqual([]);
  });

  it("leaves the user's tasks and profile alone", async () => {
    const { repo } = await demoSnapshot();
    await repo.apply([
      {
        kind: 'put',
        store: 'tasks',
        record: { id: 'real-t1', createdAt: T, title: 'Mine' },
      },
      {
        kind: 'put',
        store: 'profileFields',
        record: { id: 'real-p1', createdAt: T },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    const after = await repo.snapshot();
    expect(after.tasks.map((t) => t.id)).toEqual(['real-t1']);
    expect(after.profileFields.map((p) => p.id)).toEqual(['real-p1']);
  });

  it('removes the contact events of removed contacts only', async () => {
    const { repo } = await demoSnapshot();
    await repo.apply([
      {
        kind: 'put',
        store: 'contactEvents',
        record: { id: 'ev-demo', createdAt: T, contactId: 'demo-contact-1' },
      },
      {
        kind: 'put',
        store: 'contacts',
        record: { id: 'real-c1', createdAt: T },
      },
      {
        kind: 'put',
        store: 'contactEvents',
        record: { id: 'ev-real', createdAt: T, contactId: 'real-c1' },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    const after = await repo.snapshot();
    expect(after.contactEvents.map((e) => e.id)).toEqual(['ev-real']);
  });

  it('drops the demo anyoneHere answer from a kept company', async () => {
    const { repo } = await demoSnapshot();
    await repo.apply([
      {
        kind: 'put',
        store: 'applications',
        record: {
          id: 'real-a1',
          createdAt: T,
          companyId: 'demo-company-2',
        },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    const after = await repo.snapshot();
    const kept = after.companies.find((c) => c.id === 'demo-company-2');
    expect(kept).toBeDefined();
    expect(kept).not.toHaveProperty('anyoneHere');
    expect(anyoneHerePrompt(after, 'demo-company-2')).toBe('ask');
  });

  it('removal stays idempotent after a kept company is cleaned', async () => {
    const { repo } = await demoSnapshot();
    await repo.apply([
      {
        kind: 'put',
        store: 'applications',
        record: {
          id: 'real-a1',
          createdAt: T,
          companyId: 'demo-company-2',
        },
      },
    ]);
    await repo.apply(removeDemoOps(await repo.snapshot()));
    expect(removeDemoOps(await repo.snapshot())).toEqual([]);
  });

  it('removing twice writes nothing', async () => {
    const { repo } = await demoSnapshot();
    await repo.apply(removeDemoOps(await repo.snapshot()));
    expect(removeDemoOps(await repo.snapshot())).toEqual([]);
  });

  it('counts a lone demo task as demo data', () => {
    const snap = {
      ...emptySnapshot(),
      tasks: [{ id: 'demo-task-1', createdAt: T }],
    };
    expect(hasDemoData(snap)).toBe(true);
  });

  it('tolerates odd records without throwing', () => {
    const odd = {
      ...emptySnapshot(),
      companies: [{ id: 5, createdAt: T }],
      applications: [{ id: 'a1', createdAt: T, companyId: 7 }],
    } as unknown as Parameters<typeof removeDemoOps>[0];
    expect(hasDemoData(odd)).toBe(false);
    expect(removeDemoOps(odd)).toEqual([]);
  });
});
