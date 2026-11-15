import {
  addStatusEventOps,
  newApplicationOps,
} from '../../core/src/application-ops';
import { isLocalDate } from '../../core/src/dates';
import { createMemoryRepository } from '../../core/src/memory-repository';
import type { StatusKey } from '../../core/src/status';
import type { Deps, LocalDate, Snapshot } from '../../core/src/types';
import {
  APPLICATION_HEADERS,
  APPLICATION_NOTE_COLUMNS,
  HISTORY_HEADERS,
  UNCONFIRMED_NOTE,
  UNDATED_NOTE,
  statusRuleFor,
  type StatusRule,
} from './mapping';

export interface ParsedCsv {
  header: string[];
  rows: string[][];
}
export interface ReportItem {
  file: 'applications' | 'history';
  row: number;
  reason: string;
}
export interface Report {
  applications: { rows: number; imported: number; skipped: number };
  history: { rows: number; imported: number; skipped: number };
  companies: number;
  statusEvents: number;
  skipped: ReportItem[]; // not imported
  flagged: ReportItem[]; // imported, but the user should look
}
export interface ConvertOptions {
  statusRules: Readonly<Record<string, StatusRule>>; // the CLI passes STATUS_RULES
  undatedOn?: LocalDate;
}

type Reader = (row: string[], header: string) => string;

function makeReader(
  file: 'applications' | 'history',
  csv: ParsedCsv,
  required: readonly string[],
): Reader {
  for (const name of required) {
    if (!csv.header.includes(name)) {
      throw new Error(
        `The ${file} file is missing the required column "${name}".`,
      );
    }
  }
  return (row, header) => {
    const at = csv.header.indexOf(header);
    return at < 0 ? '' : (row[at] ?? '').trim();
  };
}

function normalise(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function threadIdOf(url: string): string | undefined {
  const match = /#all\/([A-Za-z0-9]+)/.exec(url);
  return match?.[1];
}

function extraLines(
  csv: ParsedCsv,
  row: string[],
  known: ReadonlySet<string>,
): string[] {
  const lines: string[] = [];
  csv.header.forEach((name, at) => {
    const value = (row[at] ?? '').trim();
    if (known.has(name) || value === '') return;
    lines.push(`${name !== '' ? name : `Column ${at + 1}`}: ${value}`);
  });
  return lines;
}

interface AppRow {
  row: number; // sheet row
  cells: string[];
  company: string;
  title: string;
  url: string;
  rule: StatusRule | undefined;
  rawStage: string;
  threadId: string | undefined;
  nameKey: string;
}

interface HistRow {
  row: number;
  date: LocalDate;
  rule: StatusRule;
  rawStage: string;
  lines: string[];
}

interface RawEntry {
  kind: 'opening' | 'history';
  date: LocalDate | undefined;
  effective: LocalDate;
  rank: number;
  sheetRow: number;
  hist?: HistRow;
}

interface Entry {
  status: StatusKey;
  date: LocalDate | undefined; // becomes occurredOn
  effective: LocalDate; // day used for the clock
  note: string;
}

function joinNote(lines: readonly string[]): string {
  return lines.join('\n');
}

export async function convert(
  files: { applications: ParsedCsv; history: ParsedCsv },
  options: ConvertOptions,
  deps: Deps,
): Promise<{ snapshot: Snapshot; report: Report }> {
  const appReader = makeReader(
    'applications',
    files.applications,
    Object.values(APPLICATION_HEADERS),
  );
  const histReader = makeReader(
    'history',
    files.history,
    Object.values(HISTORY_HEADERS),
  );
  const knownAppColumns = new Set<string>([
    ...Object.values(APPLICATION_HEADERS),
    ...APPLICATION_NOTE_COLUMNS,
  ]);
  const knownHistColumns = new Set<string>(Object.values(HISTORY_HEADERS));
  const lookup = (value: string) => statusRuleFor(value, options.statusRules);

  const skipped: ReportItem[] = [];
  const flagged: ReportItem[] = [];
  const skip = (file: ReportItem['file'], row: number, reason: string) =>
    skipped.push({ file, row, reason });
  const flag = (file: ReportItem['file'], row: number, reason: string) =>
    flagged.push({ file, row, reason });

  // 1. Read the application rows and decide which have a usable Stage.
  const apps: AppRow[] = files.applications.rows.map((cells, at) => {
    const get = (h: string) => appReader(cells, h);
    const rawStage = get(APPLICATION_HEADERS.stage);
    const company = get(APPLICATION_HEADERS.company);
    const title = get(APPLICATION_HEADERS.position);
    return {
      row: at + 2,
      cells,
      company,
      title,
      url: get(APPLICATION_HEADERS.postingUrl),
      rule: lookup(rawStage),
      rawStage,
      threadId: threadIdOf(get(APPLICATION_HEADERS.emailThreadUrl)),
      nameKey: `${normalise(company)}\u0000${normalise(title)}`,
    };
  });

  // 2. Index every application row (skipped ones too, so history for them
  // is reported against the right cause).
  const byThread = new Map<string, AppRow[]>();
  const byName = new Map<string, AppRow[]>();
  for (const app of apps) {
    if (app.threadId !== undefined) {
      byThread.set(app.threadId, [...(byThread.get(app.threadId) ?? []), app]);
    }
    if (app.nameKey !== '\u0000') {
      byName.set(app.nameKey, [...(byName.get(app.nameKey) ?? []), app]);
    }
  }

  // 3. Link and validate history rows.
  const histByApp = new Map<AppRow, HistRow[]>();
  let historyImported = 0;
  files.history.rows.forEach((cells, at) => {
    const row = at + 2;
    const get = (h: string) => histReader(cells, h);
    const thread = threadIdOf(get(HISTORY_HEADERS.emailThreadUrl));
    const threadApps = thread === undefined ? [] : (byThread.get(thread) ?? []);
    const threadLive = threadApps.filter((a) => a.rule !== undefined);
    const nameKey = `${normalise(get(HISTORY_HEADERS.company))}\u0000${normalise(get(HISTORY_HEADERS.position))}`;
    const byNameKey = (list: readonly AppRow[]) =>
      nameKey === '\u0000' ? [] : list.filter((a) => a.nameKey === nameKey);
    let target: AppRow | undefined;
    let narrowedFlag: string | undefined;
    if (threadApps.length > 0) {
      // A thread match is never overridden by name matching.
      if (threadLive.length === 1) {
        target = threadLive[0];
      } else if (threadLive.length === 0) {
        skip('history', row, 'its application was skipped.');
        return;
      } else {
        const narrowed = byNameKey(threadLive);
        if (narrowed.length === 1) {
          target = narrowed[0];
          narrowedFlag = `Thread matched ${threadLive.length} applications; linked by company and position.`;
        } else {
          skip(
            'history',
            row,
            `matches ${threadLive.length} applications; row not imported.`,
          );
          return;
        }
      }
    } else {
      const named = nameKey === '\u0000' ? [] : (byName.get(nameKey) ?? []);
      const live = named.filter((a) => a.rule !== undefined);
      if (live.length === 1) target = live[0];
      else if (live.length > 1) {
        skip(
          'history',
          row,
          `matches ${live.length} applications; row not imported.`,
        );
        return;
      } else if (named.length > 0) {
        skip('history', row, 'its application was skipped.');
        return;
      } else {
        skip('history', row, 'matches no application; row not imported.');
        return;
      }
    }
    if (target === undefined) return;
    const date = get(HISTORY_HEADERS.eventDate);
    if (!isLocalDate(date)) {
      skip(
        'history',
        row,
        `Event Date "${date}" is not a date; row not imported.`,
      );
      return;
    }
    const rawStage = get(HISTORY_HEADERS.stageAfterEvent);
    const rule = lookup(rawStage);
    if (rule === undefined) {
      skip(
        'history',
        row,
        `Status "${rawStage}" has no agreed mapping; row not imported.`,
      );
      return;
    }
    const type = get(HISTORY_HEADERS.eventType);
    const response = get(HISTORY_HEADERS.responseNotes);
    const lines: string[] = [];
    const main = [type, response].filter((p) => p !== '').join(': ');
    if (main !== '') lines.push(main);
    const reliability = get(HISTORY_HEADERS.sourceReliability);
    if (reliability !== '') lines.push(`Source Reliability: ${reliability}`);
    const url = get(HISTORY_HEADERS.emailThreadUrl);
    if (url !== '') lines.push(`Email Thread URL: ${url}`);
    lines.push(...extraLines(files.history, cells, knownHistColumns));
    const list = histByApp.get(target) ?? [];
    list.push({ row, date, rule, rawStage, lines });
    histByApp.set(target, list);
    historyImported += 1;
    if (narrowedFlag !== undefined) flag('history', row, narrowedFlag);
  });

  // 4. Build timelines and the application records.
  const repo = createMemoryRepository();
  let tick = 0;
  const clockDeps = (day: LocalDate): Deps => ({
    newId: () => deps.newId(),
    now: () =>
      new Date(Date.parse(`${day}T12:00:00.000Z`) + tick++).toISOString(),
  });

  interface Imported {
    app: AppRow;
  }
  const imported: Imported[] = [];

  for (const app of apps) {
    const get = (h: string) => appReader(app.cells, h);
    const rule = app.rule;
    if (rule === undefined) {
      skip(
        'applications',
        app.row,
        `Status "${app.rawStage}" has no agreed mapping; row not imported.`,
      );
      continue;
    }
    const unconfirmedApp = rule.kind === 'unconfirmed';
    const flags: string[] = [];
    const extraNotes: string[] = [];

    const rawApplied = get(APPLICATION_HEADERS.dateApplied);
    let dateApplied: LocalDate | undefined;
    if (rawApplied !== '') {
      if (isLocalDate(rawApplied)) dateApplied = rawApplied;
      else {
        flags.push(
          `Date Applied "${rawApplied}" is not a date; used the other dates.`,
        );
        extraNotes.push(`Date Applied: ${rawApplied}`);
      }
    }
    const rawFollowUp = get(APPLICATION_HEADERS.followUpDue);
    let nextActionDate: LocalDate | undefined;
    if (rawFollowUp !== '') {
      if (isLocalDate(rawFollowUp)) nextActionDate = rawFollowUp;
      else {
        flags.push(`Follow-Up Due "${rawFollowUp}" is not a date.`);
        extraNotes.push(`Follow-Up Due: ${rawFollowUp}`);
      }
    }
    const rawLast = get(APPLICATION_HEADERS.lastEventDate);
    const lastValid = rawLast !== '' && isLocalDate(rawLast);
    const mostRecent = get(APPLICATION_HEADERS.mostRecentEvent);

    const hist = histByApp.get(app) ?? [];

    // Raw entries: opening and history.
    const raw: RawEntry[] = hist.map((h) => ({
      kind: 'history',
      date: h.date,
      effective: h.date,
      rank: 1,
      sheetRow: h.row,
      hist: h,
    }));
    let undated = false;
    if (dateApplied !== undefined) {
      const covered = hist.some(
        (h) =>
          h.rule.kind === 'status' &&
          h.rule.status === 'applied' &&
          h.date === dateApplied,
      );
      if (!covered) {
        raw.push({
          kind: 'opening',
          date: dateApplied,
          effective: dateApplied,
          rank: 0,
          sheetRow: app.row,
        });
      }
    } else if (hist.length === 0 && !lastValid) {
      if (options.undatedOn === undefined) {
        skip(
          'applications',
          app.row,
          'No date in the sheet; pass --undated-on to import it.',
        );
        continue;
      }
      undated = true;
      raw.push({
        kind: 'opening',
        date: undefined,
        effective: options.undatedOn,
        rank: 0,
        sheetRow: app.row,
      });
      flags.push(
        `No date in the sheet; imported with ${options.undatedOn} as its day and no event date.`,
      );
    }
    raw.sort(
      (a, b) =>
        (a.effective < b.effective ? -1 : a.effective > b.effective ? 1 : 0) ||
        a.rank - b.rank ||
        a.sheetRow - b.sheetRow,
    );

    // Resolve statuses in order.
    const entries: Entry[] = [];
    for (const r of raw) {
      const lines: string[] = [];
      let status: StatusKey;
      if (r.kind === 'opening') {
        status = 'applied';
        if (undated) lines.push(UNDATED_NOTE);
      } else {
        const h = r.hist!;
        lines.push(...h.lines);
        if (h.rule.kind === 'status') status = h.rule.status;
        else if (h.rule.kind === 'carry-forward') {
          status = entries[entries.length - 1]?.status ?? 'applied';
          lines.push(`Sheet stage: ${h.rawStage}`);
          flag(
            'history',
            h.row,
            `Status "${h.rawStage}" has no agreed mapping; kept the previous status.`,
          );
        } else {
          status = 'interested';
          lines.push(UNCONFIRMED_NOTE);
          flag(
            'history',
            h.row,
            `Status "${h.rawStage}" is not confirmed; imported as interested.`,
          );
        }
      }
      if (unconfirmedApp && status === 'applied') {
        status = 'interested';
        if (!lines.includes(UNCONFIRMED_NOTE)) lines.push(UNCONFIRMED_NOTE);
      }
      entries.push({
        status,
        date: r.date,
        effective: r.effective,
        note: joinNote(lines),
      });
    }

    // Closing entry from the application's Stage.
    const last = entries[entries.length - 1];
    let closingStatus: StatusKey | undefined;
    const closingLines: string[] = [`Sheet stage: ${app.rawStage}`];
    if (rule.kind === 'status') {
      if (last === undefined || last.status !== rule.status)
        closingStatus = rule.status;
    } else if (rule.kind === 'carry-forward') {
      if (last === undefined) closingStatus = 'applied';
      flags.push(
        `Status "${app.rawStage}" has no agreed mapping; kept the previous status.`,
      );
    } else {
      if (last?.status !== 'interested') {
        closingStatus = 'interested';
        closingLines.push(UNCONFIRMED_NOTE);
      }
      flags.push(
        `Status "${app.rawStage}" is not confirmed; imported as interested.`,
      );
    }
    let usedLast = false;
    if (closingStatus !== undefined) {
      let date: LocalDate | undefined;
      let effective: LocalDate;
      if (lastValid && (last === undefined || rawLast >= last.effective)) {
        date = rawLast;
        effective = rawLast;
        usedLast = true;
      } else if (last !== undefined) {
        date = last.date;
        effective = last.effective;
      } else {
        // Unreachable: an entry-less row always has a valid Last Event Date.
        date = undefined;
        effective = options.undatedOn ?? rawLast;
      }
      if (mostRecent !== '')
        closingLines.push(`Most Recent Event: ${mostRecent}`);
      entries.push({
        status: closingStatus,
        date,
        effective,
        note: joinNote(closingLines),
      });
    } else {
      // No event carries the Stage text, so keep it in the notes.
      if (rule.kind !== 'status') extraNotes.push(`Stage: ${app.rawStage}`);
      if (mostRecent !== '') {
        extraNotes.push(`Most Recent Event: ${mostRecent}`);
      }
    }
    if (rawLast !== '' && !usedLast) {
      extraNotes.push(`Last Event Date: ${rawLast}`);
      if (!lastValid) {
        flags.push(`Last Event Date "${rawLast}" is not a date.`);
      }
    }

    // Application notes.
    const noteLines: string[] = [];
    for (const name of APPLICATION_NOTE_COLUMNS) {
      const value = get(name);
      if (value !== '') noteLines.push(`${name}: ${value}`);
    }
    noteLines.push(
      ...extraLines(files.applications, app.cells, knownAppColumns),
    );
    noteLines.push(...extraNotes);
    const notesCell = get(APPLICATION_HEADERS.notes);
    const notes =
      notesCell !== '' && noteLines.length > 0
        ? `${notesCell}\n\n${noteLines.join('\n')}`
        : notesCell !== ''
          ? notesCell
          : noteLines.join('\n');

    // Write through core operations.
    const first = entries[0]!;
    const created = newApplicationOps(
      {
        companyName: app.company,
        title: app.title,
        url: app.url,
        status: first.status,
        occurredOn: first.date,
        nextActionDate,
        notes,
        note: first.note,
      },
      await repo.snapshot(),
      clockDeps(first.effective),
    );
    await repo.apply(created.ops);
    for (const entry of entries.slice(1)) {
      await repo.apply(
        addStatusEventOps(
          created.applicationId,
          { status: entry.status, occurredOn: entry.date, note: entry.note },
          clockDeps(entry.effective),
        ),
      );
    }

    for (const reason of flags) flag('applications', app.row, reason);
    imported.push({ app });
  }

  // 5. Duplicates among imported applications.
  const trimLower = normalise;
  for (let i = 0; i < imported.length; i += 1) {
    for (let j = i + 1; j < imported.length; j += 1) {
      const a = imported[i]!.app;
      const b = imported[j]!.app;
      if (a.company === '' && a.title === '') continue;
      if (
        trimLower(a.company) !== trimLower(b.company) ||
        trimLower(a.title) !== trimLower(b.title)
      )
        continue;
      const likely =
        a.url !== '' && b.url !== '' && trimLower(a.url) === trimLower(b.url);
      const text = (other: number) =>
        likely
          ? `Likely duplicate of row ${other} (same company, title and URL).`
          : `Possible duplicate of row ${other} (same company and title, different or missing URL).`;
      flag('applications', a.row, text(b.row));
      flag('applications', b.row, text(a.row));
    }
  }

  const snapshot = await repo.snapshot();
  const order = (x: ReportItem, y: ReportItem) =>
    (x.file === y.file ? 0 : x.file === 'applications' ? -1 : 1) ||
    x.row - y.row;
  skipped.sort(order);
  flagged.sort(order);

  const appSkipped = skipped.filter((i) => i.file === 'applications').length;
  const histSkipped = skipped.filter((i) => i.file === 'history').length;
  return {
    snapshot,
    report: {
      applications: {
        rows: files.applications.rows.length,
        imported: imported.length,
        skipped: appSkipped,
      },
      history: {
        rows: files.history.rows.length,
        imported: historyImported,
        skipped: histSkipped,
      },
      companies: snapshot.companies.length,
      statusEvents: snapshot.statusEvents.length,
      skipped,
      flagged,
    },
  };
}
