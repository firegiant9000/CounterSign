import {
  closeSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isLocalDate } from '../../core/src/dates';
import {
  buildExport,
  exportFileName,
  parseExport,
  type ParseResult,
} from '../../core/src/export';
import type { Deps } from '../../core/src/types';
import { convert, type Report, type ReportItem } from './convert';
import { parseCsv } from './csv';
import { STATUS_RULES } from './mapping';

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
}

/** Seams for tests; the defaults are the real thing. */
export interface Ports {
  validate?: (text: string) => ParseResult;
  openFile?: (file: string) => number; // default: exclusive create (wx)
  writeFd?: (fd: number, data: string) => void;
}

const USAGE =
  'Usage: npm run import-sheet -- --applications <csv> --history <csv> --out <folder> [--undated-on YYYY-MM-DD] [--dry-run]\n';

function formatItems(title: string, items: ReportItem[]): string {
  const sorted = [...items].sort(
    (a, b) => a.file.localeCompare(b.file) || a.row - b.row,
  );
  const lines = sorted.map((i) => `  ${i.file} row ${i.row}: ${i.reason}`);
  return [`${title} (${items.length}):`, ...lines].join('\n');
}

function formatReport(r: Report): string {
  return (
    [
      `Applications: ${r.applications.rows} rows, ${r.applications.imported} imported, ${r.applications.skipped} skipped`,
      `History: ${r.history.rows} rows, ${r.history.imported} imported, ${r.history.skipped} skipped`,
      `Companies: ${r.companies}`,
      `Status events: ${r.statusEvents}`,
      '',
      formatItems('Skipped', r.skipped),
      '',
      formatItems('Flagged', r.flagged),
    ].join('\n') + '\n'
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runImportSheet(
  argv: string[],
  io: Io,
  deps: Deps,
  ports: Ports = {},
): Promise<number> {
  const validate = ports.validate ?? parseExport;
  const openFile = ports.openFile ?? ((file: string) => openSync(file, 'wx'));
  const writeFd =
    ports.writeFd ?? ((fd: number, data: string) => writeFileSync(fd, data));
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        applications: { type: 'string' },
        history: { type: 'string' },
        out: { type: 'string' },
        'undated-on': { type: 'string' },
        'dry-run': { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    io.stderr(`${message(error)}\n${USAGE}`);
    return 2;
  }
  const dryRun = values['dry-run'] === true;
  const { applications, history, out } = values;
  const undatedOn = values['undated-on'];
  if (
    applications === undefined ||
    history === undefined ||
    (out === undefined && !dryRun)
  ) {
    io.stderr(`Missing a required option.\n${USAGE}`);
    return 2;
  }
  if (undatedOn !== undefined && !isLocalDate(undatedOn)) {
    io.stderr(`--undated-on must be a real date as YYYY-MM-DD.\n${USAGE}`);
    return 2;
  }

  let result;
  try {
    const files = {
      applications: parseCsv(readFileSync(applications, 'utf8')),
      history: parseCsv(readFileSync(history, 'utf8')),
    };
    result = await convert(
      files,
      { statusRules: STATUS_RULES, undatedOn },
      deps,
    );
  } catch (error) {
    io.stderr(`${message(error)}\n`);
    return 1;
  }
  io.stdout(formatReport(result.report));
  if (dryRun || out === undefined) return 0;

  let isDirectory = false;
  try {
    isDirectory = statSync(out).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    io.stderr(`The output folder does not exist: ${out}\n`);
    return 1;
  }

  const at = deps.now();
  const file = buildExport(result.snapshot, {}, { now: () => at });
  const text = JSON.stringify(file, null, 2);
  const check = validate(text);
  if (!check.ok) {
    io.stderr(
      `The generated file failed validation, nothing was written:\n${check.errors.join('\n')}\n`,
    );
    return 1;
  }
  const target = path.join(out, exportFileName('export', at));
  // Remove the file only if this run created it, so a truncated export is
  // never left behind and an existing file is never touched.
  let fd: number;
  try {
    fd = openFile(target);
  } catch (error) {
    const exists = (error as NodeJS.ErrnoException).code === 'EEXIST';
    io.stderr(
      exists
        ? `${target} already exists; not overwriting it.\n`
        : `Could not write ${target}: ${message(error)}\n`,
    );
    return 1;
  }
  try {
    writeFd(fd, text);
  } catch (error) {
    try {
      closeSync(fd);
    } catch {
      // best effort
    }
    try {
      rmSync(target);
    } catch {
      // best effort
    }
    io.stderr(`Could not write ${target}: ${message(error)}\n`);
    return 1;
  }
  try {
    closeSync(fd);
  } catch (error) {
    try {
      rmSync(target);
    } catch {
      // best effort
    }
    io.stderr(`Could not write ${target}: ${message(error)}\n`);
    return 1;
  }
  io.stdout(`Wrote ${target}\n`);
  return 0;
}
