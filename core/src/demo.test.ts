import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import { applicationRows } from './application-list';
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
    expect(snap.applications).toHaveLength(8);
    for (const app of snap.applications) {
      expect(app.url?.startsWith('https://example.com/')).toBe(true);
    }
  });

  it('shows active and archived applications', async () => {
    const { snap } = await demoSnapshot();
    const rows = applicationRows(snap);
    expect(rows).toHaveLength(8);
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
