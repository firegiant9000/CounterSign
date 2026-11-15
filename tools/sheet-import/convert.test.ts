import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../../core/testing/fixed-deps';
import { buildExport, parseExport } from '../../core/src/export';
import { currentStatus, historyFor, isArchived } from '../../core/src/status';
import type { Snapshot } from '../../core/src/types';
import { parseCsv } from './csv';
import { convert, type ParsedCsv } from './convert';
import { STATUS_RULES, UNCONFIRMED_NOTE, UNDATED_NOTE } from './mapping';

function fixture(name: string): ParsedCsv {
  return parseCsv(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

const applications = fixture('applications.fixture.csv');
const history = fixture('history.fixture.csv');
const options = { statusRules: STATUS_RULES };

function run(extra: { undatedOn?: string } = {}) {
  return convert(
    { applications, history },
    { ...options, ...extra },
    fixedDeps(),
  );
}

function appByRow(snapshot: Snapshot, title: string, url?: string) {
  const found = snapshot.applications.filter(
    (a) => a.title === title && (url === undefined || a.url === url),
  );
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe('convert', () => {
  it('produces a snapshot that parseExport accepts with the expected counts', async () => {
    const { snapshot, report } = await run();
    const parsed = parseExport(
      JSON.stringify(buildExport(snapshot, {}, fixedDeps())),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts.companies).toBe(7);
    expect(parsed.counts.applications).toBe(11);
    expect(parsed.counts.statusEvents).toBe(20);
    expect(parsed.counts.documents).toBe(0);
    expect(parsed.counts.canonicalAnswers).toBe(0);
    expect(report.companies).toBe(7);
    expect(report.statusEvents).toBe(20);
  });

  it('keeps one company record for a name typed in two cases', async () => {
    const { snapshot } = await run();
    const acme = snapshot.companies.filter(
      (c) => c.name?.toLowerCase() === 'acme widgets',
    );
    expect(acme).toHaveLength(1);
    const apps = snapshot.applications.filter(
      (a) => a.companyId === acme[0]!.id,
    );
    expect(apps).toHaveLength(2);
  });

  it('keeps invariants: imported + skipped = rows, one skipped item per skipped row', async () => {
    const { report } = await run();
    expect(report.applications.rows).toBe(13);
    expect(report.history.rows).toBe(14);
    for (const file of ['applications', 'history'] as const) {
      const part = report[file];
      expect(part.imported + part.skipped).toBe(part.rows);
      const items = report.skipped.filter((i) => i.file === file);
      expect(items).toHaveLength(part.skipped);
      expect(new Set(items.map((i) => i.row)).size).toBe(items.length);
    }
  });

  it('makes the current status the chronologically last history row', async () => {
    const { snapshot } = await run();
    const widget = appByRow(snapshot, 'Widget Engineer');
    expect(currentStatus(snapshot.statusEvents, widget.id)?.status).toBe(
      'interview',
    );
    const support = appByRow(snapshot, 'Support Lead — Night Shift');
    expect(currentStatus(snapshot.statusEvents, support.id)?.status).toBe(
      'interview',
    );
  });

  it('keeps same-day history rows in sheet order', async () => {
    const { snapshot } = await run();
    const widget = appByRow(snapshot, 'Widget Engineer');
    const events = historyFor(snapshot.statusEvents, widget.id);
    expect(events.map((e) => [e.occurredOn, e.status])).toEqual([
      ['2026-01-05', 'applied'],
      ['2026-01-14', 'phone_screen'],
      ['2026-01-14', 'interview'],
    ]);
  });

  it('does not duplicate the opening event when a history row is the application', async () => {
    const { snapshot } = await run();
    const widget = appByRow(snapshot, 'Widget Engineer');
    const applied = snapshot.statusEvents.filter(
      (e) => e.applicationId === widget.id && e.status === 'applied',
    );
    expect(applied).toHaveLength(1);
    expect(applied[0]!.note).toContain('Application: Submitted via portal');
    expect(applied[0]!.note).toContain('Source Reliability: High');
  });

  it('turns a Closed row into position_closed and archives it', async () => {
    const { snapshot } = await run();
    const app = appByRow(snapshot, 'Data Analyst');
    const current = currentStatus(snapshot.statusEvents, app.id);
    expect(current?.status).toBe('position_closed');
    expect(current?.occurredOn).toBe('2026-02-01');
    expect(current?.note).toContain('Sheet stage: Closed');
    expect(current?.note).toContain('Most Recent Event: Posting removed');
    expect(isArchived(current)).toBe(true);
  });

  it('imports a Not submitted row as interested, flagged, with no applied event', async () => {
    const { snapshot, report } = await run();
    const app = appByRow(snapshot, 'Platform Engineer');
    const events = historyFor(snapshot.statusEvents, app.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe('interested');
    expect(events[0]!.note).toContain(UNCONFIRMED_NOTE);
    expect(events.some((e) => e.status === 'applied')).toBe(false);
    expect(app.nextActionDate).toBe('2026-03-01');
    expect(
      report.flagged.some((i) => i.file === 'applications' && i.row === 5),
    ).toBe(true);
  });

  it('imports an unconfirmed history row as interested and flags it', async () => {
    const { snapshot, report } = await run();
    const app = appByRow(snapshot, 'Staff Writer');
    const current = currentStatus(snapshot.statusEvents, app.id);
    expect(current?.status).toBe('interested');
    expect(current?.note).toContain(UNCONFIRMED_NOTE);
    expect(
      report.flagged.some((i) => i.file === 'history' && i.row === 10),
    ).toBe(true);
  });

  it('skips an unmapped status, naming the value and row', async () => {
    const { report } = await run();
    const item = report.skipped.find(
      (i) => i.file === 'applications' && i.row === 6,
    );
    expect(item?.reason).toBe(
      'Status "Ghosted" has no agreed mapping; row not imported.',
    );
  });

  it('skips history rows with unreadable date, unmapped stage, orphan, ambiguous or skipped application', async () => {
    const { report } = await run();
    const reason = (row: number) =>
      report.skipped.find((i) => i.file === 'history' && i.row === row)?.reason;
    expect(reason(11)).toBe('matches no application; row not imported.');
    expect(reason(12)).toBe('matches 2 applications; row not imported.');
    expect(reason(13)).toContain('"soon"');
    expect(reason(14)).toContain('"Offer pending"');
    expect(reason(15)).toBe('its application was skipped.');
  });

  it('keeps the previous status for carry-forward rows and flags them', async () => {
    const { snapshot, report } = await run();
    const app = appByRow(snapshot, 'Editor');
    const events = historyFor(snapshot.statusEvents, app.id);
    expect(events.map((e) => e.status)).toEqual([
      'applied',
      'phone_screen',
      'phone_screen',
    ]);
    expect(events[2]!.note).toContain('Sheet stage: Needs review');
    expect(
      report.flagged.some((i) => i.file === 'history' && i.row === 9),
    ).toBe(true);
  });

  it('links history by thread id across the u/0 and ?authuser= forms', async () => {
    const { snapshot } = await run();
    const support = appByRow(snapshot, 'Support Lead — Night Shift');
    const events = historyFor(snapshot.statusEvents, support.id);
    // opening + row 5 (thread, u/1 form) + row 6 + row 7
    expect(events).toHaveLength(4);
    expect(events[1]!.occurredOn).toBe('2026-01-20');
    expect(events[1]!.note).toContain('First round');
  });

  it('skips an undated row without undatedOn', async () => {
    const { report, snapshot } = await run();
    expect(
      report.skipped.find((i) => i.file === 'applications' && i.row === 8)
        ?.reason,
    ).toContain('--undated-on');
    expect(
      snapshot.applications.some((a) => a.title === 'Ops Coordinator'),
    ).toBe(false);
  });

  it('imports an undated row with undatedOn and no occurredOn', async () => {
    const { report, snapshot } = await run({ undatedOn: '2026-03-10' });
    const app = appByRow(snapshot, 'Ops Coordinator');
    const events = historyFor(snapshot.statusEvents, app.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.occurredOn).toBeUndefined();
    expect(events[0]!.note).toBe(UNDATED_NOTE);
    expect(events[0]!.createdAt.slice(0, 10)).toBe('2026-03-10');
    expect(app.createdAt.slice(0, 10)).toBe('2026-03-10');
    expect(
      report.flagged.some((i) => i.file === 'applications' && i.row === 8),
    ).toBe(true);
    expect(report.applications.skipped).toBe(1);
  });

  it('flags an unreadable Date Applied and keeps the text in notes', async () => {
    const { snapshot, report } = await run();
    const app = appByRow(snapshot, 'Release Manager');
    expect(app.notes).toContain('Date Applied: last Tuesday');
    const item = report.flagged.find(
      (i) => i.file === 'applications' && i.row === 7,
    );
    expect(item?.reason).toContain('"last Tuesday"');
    const events = historyFor(snapshot.statusEvents, app.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.occurredOn).toBe('2026-01-20');
  });

  it('imports and flags both rows of a likely and a possible duplicate', async () => {
    const { snapshot, report } = await run();
    expect(
      snapshot.applications.filter((a) => a.title === 'Analyst'),
    ).toHaveLength(2);
    expect(
      snapshot.applications.filter((a) => a.title === 'Designer'),
    ).toHaveLength(2);
    const reasonFor = (row: number) =>
      report.flagged.find((i) => i.file === 'applications' && i.row === row)
        ?.reason;
    expect(reasonFor(11)).toBe(
      'Likely duplicate of row 12 (same company, title and URL).',
    );
    expect(reasonFor(12)).toBe(
      'Likely duplicate of row 11 (same company, title and URL).',
    );
    expect(reasonFor(13)).toBe(
      'Possible duplicate of row 14 (same company and title, different or missing URL).',
    );
    expect(reasonFor(14)).toBe(
      'Possible duplicate of row 13 (same company and title, different or missing URL).',
    );
  });

  it('puts note columns and unmapped columns into notes as Header: value', async () => {
    const apps = parseCsv(
      [
        applications.header.join(',') + ',Recruiter',
        'Acme Widgets,Role,2026-01-05,Referral,"Remote, EU",,Applied,,,,,,,,Hello,High,,Pat Example',
      ].join('\n'),
    );
    const { snapshot } = await convert(
      { applications: apps, history: { header: history.header, rows: [] } },
      options,
      fixedDeps(),
    );
    const notes = snapshot.applications[0]!.notes ?? '';
    expect(notes.startsWith('Hello\n\n')).toBe(true);
    expect(notes).toContain('Channel: Referral');
    expect(notes).toContain('Location / Remote: Remote, EU');
    expect(notes).toContain('Priority: High');
    expect(notes).toContain('Recruiter: Pat Example');
  });

  it('puts unmapped history columns into the event note', async () => {
    const apps = parseCsv(
      [
        applications.header.join(','),
        'Acme Widgets,Role,2026-01-05,,,,Applied,,,,,,,,,,',
      ].join('\n'),
    );
    const hist = parseCsv(
      [
        history.header.join(',') + ',Mood',
        '2026-01-09,Acme Widgets,Role,Email,Thanks,Applied,High,,Upbeat',
      ].join('\n'),
    );
    const { snapshot } = await convert(
      { applications: apps, history: hist },
      options,
      fixedDeps(),
    );
    const notes = snapshot.statusEvents.map((e) => e.note ?? '').join('\n');
    expect(notes).toContain('Mood: Upbeat');
  });

  it('prefers the imported application when a skipped one shares the name', async () => {
    const apps = parseCsv(
      [
        applications.header.join(','),
        'Acme Widgets,Role,2026-01-05,,,,Interviewing,,,,,,,,,,',
        'Acme Widgets,Role,2026-01-06,,,,Ghosted,,,,,,,,,,',
      ].join('\n'),
    );
    const hist = parseCsv(
      [
        history.header.join(','),
        '2026-01-09,Acme Widgets,Role,Email,Thanks,Interviewing,High,',
      ].join('\n'),
    );
    const { snapshot, report } = await convert(
      { applications: apps, history: hist },
      options,
      fixedDeps(),
    );
    expect(report.history.imported).toBe(1);
    expect(snapshot.statusEvents.map((e) => e.status)).toEqual([
      'applied',
      'interview',
    ]);
  });

  it('skips a history row whose only match was a skipped application', async () => {
    const apps = parseCsv(
      [
        applications.header.join(','),
        'Acme Widgets,Role,2026-01-06,,,,Ghosted,,,,,,,,,,',
      ].join('\n'),
    );
    const hist = parseCsv(
      [
        history.header.join(','),
        '2026-01-09,Acme Widgets,Role,Email,Thanks,Applied,High,',
      ].join('\n'),
    );
    const { report } = await convert(
      { applications: apps, history: hist },
      options,
      fixedDeps(),
    );
    expect(report.skipped.find((i) => i.file === 'history')?.reason).toBe(
      'its application was skipped.',
    );
  });

  it('treats names that differ only in inner whitespace as duplicates', async () => {
    const apps = parseCsv(
      [
        applications.header.join(','),
        'Acme  Widgets,Role,2026-01-05,,,,Applied,,,,,,,,,,',
        'Acme Widgets,Role,2026-01-06,,,,Applied,,,,,,,,,,',
      ].join('\n'),
    );
    const { report } = await convert(
      { applications: apps, history: { header: history.header, rows: [] } },
      options,
      fixedDeps(),
    );
    expect(
      report.flagged.filter((i) => i.reason.includes('duplicate')),
    ).toHaveLength(2);
  });

  it('records the Stage text in notes when no event note carries it', async () => {
    const apps = parseCsv(
      [
        applications.header.join(','),
        'Acme Widgets,Carry,2026-01-05,,,,Awaiting response,,,,,,,,,,',
        'Acme Widgets,Unconf,2026-01-05,,,,Not submitted,,,,,,,,,,',
      ].join('\n'),
    );
    const { snapshot } = await convert(
      { applications: apps, history: { header: history.header, rows: [] } },
      options,
      fixedDeps(),
    );
    const notesOf = (title: string) =>
      snapshot.applications.find((a) => a.title === title)?.notes;
    expect(notesOf('Carry')).toContain('Stage: Awaiting response');
    expect(notesOf('Unconf')).toContain('Stage: Not submitted');
  });

  it('gives strictly increasing createdAt per application with no wall-clock dates', async () => {
    const { snapshot } = await run({ undatedOn: '2026-03-10' });
    const today = new Date().toISOString().slice(0, 10);
    for (const app of snapshot.applications) {
      const events = historyFor(snapshot.statusEvents, app.id);
      for (let i = 1; i < events.length; i += 1) {
        expect(events[i]!.createdAt > events[i - 1]!.createdAt).toBe(true);
      }
    }
    const all = [
      ...snapshot.companies,
      ...snapshot.applications,
      ...snapshot.statusEvents,
    ];
    for (const r of all) expect(r.createdAt).not.toContain(today);
  });

  it('gives the same output on two runs', async () => {
    const a = await run({ undatedOn: '2026-03-10' });
    const b = await run({ undatedOn: '2026-03-10' });
    expect(a).toEqual(b);
  });

  it('throws naming the file and the header when a required header is missing', async () => {
    const bad = {
      header: applications.header.filter((h) => h !== 'Stage'),
      rows: [],
    };
    await expect(
      convert({ applications: bad, history }, options, fixedDeps()),
    ).rejects.toThrow(/applications.*"Stage"/);
    const badHistory = {
      header: history.header.filter((h) => h !== 'Event Date'),
      rows: [],
    };
    await expect(
      convert({ applications, history: badHistory }, options, fixedDeps()),
    ).rejects.toThrow(/history.*"Event Date"/);
  });
});
