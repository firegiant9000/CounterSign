import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/v1-export.fixture.json';
import v2Fixture from '../fixtures/v2-export.fixture.json';
import {
  buildExport,
  emptiedStores,
  exportFileName,
  parseExport,
} from './export';
import { MIGRATIONS } from './migrations';
import type { Migration } from './migrations';
import { createMemoryRepository } from './memory-repository';
import { emptySnapshot, STORES } from './schema';
import type { Snapshot, StoreName } from './types';

const T = '2026-01-05T09:00:00.000Z';
const fixtureText = JSON.stringify(fixture);
const v2Text = JSON.stringify(v2Fixture);
const V2_SETTINGS = { noResponseDays: 45, statusLabels: { applied: 'Sent' } };
const NEW_STORES = [
  'jobs',
  'statements',
  'contacts',
  'contactEvents',
  'tasks',
  'profileFields',
] as const;
const NEW_ZERO = {
  jobs: 0,
  statements: 0,
  contacts: 0,
  contactEvents: 0,
  tasks: 0,
  profileFields: 0,
};

function envelope(data: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'countersign',
    schemaVersion: 1,
    data,
    ...extra,
  });
}

describe('buildExport and exportFileName', () => {
  it('builds the envelope', () => {
    const file = buildExport(
      emptySnapshot(),
      {},
      { now: () => '2026-11-14T15:30:00.000Z' },
    );
    expect(file).toEqual({
      app: 'countersign',
      schemaVersion: 2,
      exportedAt: '2026-11-14T15:30:00.000Z',
      data: emptySnapshot(),
      settings: {},
    });
  });

  it('names files so that .gitignore catches them', () => {
    expect(exportFileName('export', '2026-11-14T15:30:00.000Z')).toBe(
      'countersign-export-20261114-153000Z.json',
    );
    expect(exportFileName('pre-restore', '2026-11-14T15:30:00.000Z')).toBe(
      'countersign-export-pre-restore-20261114-153000Z.json',
    );
  });

  it('uses the UTC fields of the instant, not local time', () => {
    expect(exportFileName('export', '2026-12-31T23:59:59.000Z')).toBe(
      'countersign-export-20261231-235959Z.json',
    );
  });
});

describe('parseExport', () => {
  it('round-trips: export, parse, restore into an empty repository', async () => {
    const first = createMemoryRepository();
    await first.replaceAll({
      ...emptySnapshot(),
      companies: [{ id: 'c1', createdAt: T, name: 'Acme Example' }],
      applications: [
        { id: 'a1', createdAt: T, companyId: 'c1', title: 'Widget' },
      ],
      statusEvents: [
        { id: 'e1', createdAt: T, applicationId: 'a1', status: 'applied' },
      ],
    });
    const snap = await first.snapshot();
    const text = JSON.stringify(buildExport(snap, {}, { now: () => T }));
    const parsed = parseExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const second = createMemoryRepository();
    await second.replaceAll(parsed.file.data);
    expect(await second.snapshot()).toEqual(snap);
    expect(parsed.counts).toEqual({
      companies: 1,
      applications: 1,
      statusEvents: 1,
      documents: 0,
      canonicalAnswers: 0,
      ...NEW_ZERO,
    });
  });

  it('round-trips the Formhand fields and the cut-off', () => {
    const snap: Snapshot = {
      ...emptySnapshot(),
      applications: [
        {
          id: 'a1',
          createdAt: T,
          companyId: 'c1',
          siteType: 'workday',
          fillOutcome: 'partly',
          fillNote: 'Skipped the address step',
        },
      ],
      statements: [
        {
          id: 's1',
          createdAt: T,
          applicationId: 'a1',
          answerKey: 'notice-period',
          value: { type: 'text', value: 'Two weeks' },
          exception: true,
        },
      ],
    };
    const settings = { noResponseDays: 45 };
    const parsed = parseExport(
      JSON.stringify(buildExport(snap, settings, { now: () => T })),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.data).toEqual(snap);
    expect(parsed.file.settings).toEqual(settings);
  });

  it('restores an export without the new fields', () => {
    const result = parseExport(fixtureText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const app of result.file.data.applications) {
      expect(app).not.toHaveProperty('siteType');
      expect(app).not.toHaveProperty('fillOutcome');
      expect(app).not.toHaveProperty('fillNote');
    }
    expect(result.file.settings).not.toHaveProperty('noResponseDays');
  });

  it('reads the schema 1 fixture at schema 2', () => {
    const result = parseExport(fixtureText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.schemaVersion).toBe(2);
    expect(result.counts).toEqual({
      companies: 2,
      applications: 3,
      statusEvents: 5,
      documents: 1,
      canonicalAnswers: 2,
      ...NEW_ZERO,
    });
    const raw = fixture.data as unknown as Record<string, unknown[]>;
    for (const name of [
      'companies',
      'applications',
      'statusEvents',
      'documents',
      'canonicalAnswers',
    ] as const) {
      expect(result.file.data[name]).toEqual(raw[name]);
    }
    for (const name of NEW_STORES) {
      expect(result.file.data[name]).toEqual([]);
      expect(result.counts[name]).toBe(0);
    }
    expect(result.file.exportedAt).toBe('2026-02-01T10:00:00.000Z');
    expect(result.file.settings).toEqual({ statusLabels: { applied: 'Sent' } });
    expect(result.file.data.companies[0]?.name).toBe('Ashgrove Example Works');
    expect(
      result.file.data.statusEvents
        .filter((e) => e.voidedAt !== undefined)
        .map((e) => e.id),
    ).toEqual(['ev-4']);
    expect(result.file.data.documents[0]?.sha256).toHaveLength(64);
  });

  it('parses the schema 2 fixture', () => {
    const result = parseExport(v2Text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.schemaVersion).toBe(2);
    const raw = v2Fixture.data as unknown as Record<string, unknown[]>;
    for (const { name } of STORES) {
      const records = raw[name] ?? [];
      expect(records.length).toBeGreaterThan(0);
      expect(result.file.data[name]).toEqual(records);
      expect(result.counts[name]).toBe(records.length);
    }
    expect(result.file.settings).toEqual(V2_SETTINGS);
  });

  it('round-trips the stage 2 fixture', () => {
    const snap = v2Fixture.data as unknown as Snapshot;
    const text = JSON.stringify(
      buildExport(snap, V2_SETTINGS, { now: () => T }),
    );
    const parsed = parseExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.data).toEqual(snap);
    expect(parsed.file.settings).toEqual(V2_SETTINGS);
  });

  it('keeps fields it does not know', () => {
    const result = parseExport(fixtureText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const app2 = result.file.data.applications.find((a) => a.id === 'app-2');
    expect(app2).toHaveProperty('futureField', { tag: 'kept', n: 7 });
  });

  it('reads a missing store as empty', () => {
    const result = parseExport(
      envelope({ companies: [{ id: 'c1', createdAt: T }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.data.applications).toEqual([]);
    expect(result.file.data.canonicalAnswers).toEqual([]);
    expect(result.counts.companies).toBe(1);
    expect(result.counts.applications).toBe(0);
    expect(result.file.settings).toEqual({});
  });

  it.each([
    ['{ not json', 'This is not a JSON file.'],
    ['[]', 'This is not a Countersign export.'],
    ['null', 'This is not a Countersign export.'],
    [
      '{"app":"other","schemaVersion":1,"data":{}}',
      'This is not a Countersign export.',
    ],
    [
      '{"app":"countersign","schemaVersion":"1","data":{}}',
      'The schema version is missing or not a whole number.',
    ],
    [
      '{"app":"countersign","schemaVersion":0,"data":{}}',
      'The schema version is missing or not a whole number.',
    ],
    [
      '{"app":"countersign","schemaVersion":1.5,"data":{}}',
      'The schema version is missing or not a whole number.',
    ],
    [
      '{"app":"countersign","schemaVersion":99,"data":{}}',
      'This file was made by a newer version of Countersign (schema 99). Update the extension first.',
    ],
    [
      '{"app":"countersign","schemaVersion":1}',
      'The file has no data section.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":[]}',
      'The file has no data section.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{},"settings":[]}',
      'The settings section is not an object.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{"applications":{}}}',
      'applications is not a list.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{"widgets":[]}}',
      'Unknown store "widgets".',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{"applications":[{"createdAt":"2026-01-05T09:00:00.000Z"}]}}',
      'applications[0] has no id.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{"applications":[{"id":"a1"}]}}',
      'applications[0] has no createdAt.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{"companies":[null]}}',
      'companies[0] is not a record.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{"companies":[[1]]}}',
      'companies[0] is not a record.',
    ],
    [
      '{"app":"countersign","schemaVersion":1,"data":{"companies":[{"id":"","createdAt":"x"}]}}',
      'companies[0] has no id.',
    ],
  ])('rejects %s', (text, message) => {
    expect(parseExport(text)).toEqual({ ok: false, errors: [message] });
  });

  it('rejects two records with the same id in one store', () => {
    const result = parseExport(
      envelope({
        applications: [
          { id: 'a1', createdAt: T },
          { id: 'a1', createdAt: T },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: ['applications has two records with id "a1".'],
    });
  });

  it('caps the error list at 20', () => {
    const bad = Array.from({ length: 30 }, () => ({ createdAt: T }));
    const result = parseExport(envelope({ applications: bad }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(21);
    expect(result.errors[0]).toBe('applications[0] has no id.');
    expect(result.errors[20]).toBe('and 10 more.');
  });

  it('lifts a schema 1 file through the real migration', () => {
    expect(MIGRATIONS).toHaveLength(1);
    const step = MIGRATIONS[0];
    expect(step?.to).toBe(2);
    const data = { companies: [{ id: 'c1', createdAt: T }] };
    const lifted = step?.migrate({ schemaVersion: 1, data, settings: {} });
    expect(lifted?.schemaVersion).toBe(2);
    expect(lifted?.data).toEqual(data);
  });

  it('counts every store in STORES', () => {
    const result = parseExport(fixtureText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.counts).sort()).toEqual(
      STORES.map((s) => s.name).sort(),
    );
  });

  it('rejects a schema 3 file', () => {
    expect(
      parseExport(
        JSON.stringify({ app: 'countersign', schemaVersion: 3, data: {} }),
      ),
    ).toEqual({
      ok: false,
      errors: [
        'This file was made by a newer version of Countersign (schema 3). Update the extension first.',
      ],
    });
  });

  it('runs migrations in order, forward only', () => {
    const calls: number[] = [];
    const step = (to: number): Migration => ({
      to,
      migrate: (f) => {
        calls.push(to);
        return { ...f, schemaVersion: to };
      },
    });
    const text = JSON.stringify({
      app: 'countersign',
      schemaVersion: 2,
      exportedAt: T,
      data: {},
      settings: {},
    });
    const result = parseExport(text, {
      migrations: [step(2), step(3), step(4)],
      target: 4,
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([3, 4]);
  });

  it('refuses when a migration step is missing, and runs nothing', () => {
    const calls: number[] = [];
    const step = (to: number): Migration => ({
      to,
      migrate: (f) => {
        calls.push(to);
        return { ...f, schemaVersion: to };
      },
    });
    const result = parseExport(envelope({}), {
      migrations: [step(3)],
      target: 3,
    });
    expect(result).toEqual({
      ok: false,
      errors: ['No migration path from schema 1 to schema 3.'],
    });
    expect(calls).toEqual([]);
  });

  it('validates migrated data against the target stores', () => {
    const migrate: Migration = {
      to: 2,
      migrate: (f) => ({
        ...f,
        schemaVersion: 2,
        data: { ...f.data, applications: [{ id: 'a1', createdAt: T }] },
      }),
    };
    const result = parseExport(envelope({}), {
      migrations: [migrate],
      target: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.applications).toBe(1);
  });

  it('accumulates record errors across stores', () => {
    const result = parseExport(
      envelope({
        companies: [{ createdAt: T }],
        documents: [{ id: 'd1' }],
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: ['companies[0] has no id.', 'documents[0] has no createdAt.'],
    });
  });

  it('reports a failed upgrade when a migration throws', () => {
    const migrate: Migration = {
      to: 2,
      migrate: () => {
        throw new Error('boom');
      },
    };
    expect(
      parseExport(envelope({}), { migrations: [migrate], target: 2 }),
    ).toEqual({ ok: false, errors: ['The upgrade to schema 2 failed.'] });
  });

  it('reports a failed upgrade when a migration returns a non-object', () => {
    const migrate = {
      to: 2,
      migrate: () => 'nope',
    } as unknown as Migration;
    expect(
      parseExport(envelope({}), { migrations: [migrate], target: 2 }),
    ).toEqual({ ok: false, errors: ['The upgrade to schema 2 failed.'] });
  });

  it('gives the newer-version message even when data is missing', () => {
    expect(
      parseExport(JSON.stringify({ app: 'countersign', schemaVersion: 99 })),
    ).toEqual({
      ok: false,
      errors: [
        'This file was made by a newer version of Countersign (schema 99). Update the extension first.',
      ],
    });
  });
});

describe('emptiedStores', () => {
  const rec = (id: string) => ({ id, createdAt: T });
  const zero = () => {
    const counts = {} as Record<StoreName, number>;
    for (const { name } of STORES) counts[name] = 0;
    return counts;
  };
  it('lists a store the file would empty while it holds records', () => {
    const current = emptySnapshot();
    (current as unknown as Record<string, unknown[]>)['companies'] = [
      rec('c1'),
    ];
    (current as unknown as Record<string, unknown[]>)['applications'] = [
      rec('a1'),
    ];
    const counts = zero();
    counts.applications = 2;
    expect(emptiedStores(current, counts)).toEqual(['companies']);
  });
  it('lists nothing when every current store is empty', () => {
    expect(emptiedStores(emptySnapshot(), zero())).toEqual([]);
  });
  it('still lists a populated store with count 0 when a sibling is malformed', () => {
    const current = emptySnapshot() as unknown as Record<string, unknown>;
    current['companies'] = [rec('c1')];
    current['applications'] = 'oops';
    expect(emptiedStores(current as unknown as Snapshot, zero())).toEqual([
      'companies',
    ]);
  });
  it('treats a missing store as empty without throwing', () => {
    const current = emptySnapshot() as unknown as Record<string, unknown>;
    delete current['companies'];
    current['applications'] = 'oops';
    expect(emptiedStores(current as unknown as Snapshot, zero())).toEqual([]);
  });
});
