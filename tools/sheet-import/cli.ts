import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isLocalDate } from '../../core/src/dates';
import {
  buildExport,
  exportFileName,
  parseExport,
} from '../../core/src/export';
import type { Deps } from '../../core/src/types';
import { browserDeps } from '../../shell/deps';
import { convert, type Report, type ReportItem } from './convert';
import { parseCsv } from './csv';
import { STATUS_RULES } from './mapping';

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
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
): Promise<number> {
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
  const check = parseExport(text);
  if (!check.ok) {
    io.stderr(
      `The generated file failed validation, nothing was written:\n${check.errors.join('\n')}\n`,
    );
    return 1;
  }
  const target = path.join(out, exportFileName('export', at));
  try {
    writeFileSync(target, text, { flag: 'wx' });
  } catch (error) {
    io.stderr(`Could not write ${target}: ${message(error)}\n`);
    return 1;
  }
  io.stdout(`Wrote ${target}\n`);
  return 0;
}

// Run only when started as a script, not when a test imports this module.
const entry = process.argv[1];
if (
  entry !== undefined &&
  path.basename(entry).startsWith('cli') &&
  import.meta.url === pathToFileURL(entry).href
) {
  process.exitCode = await runImportSheet(
    process.argv.slice(2),
    {
      stdout: (t) => process.stdout.write(t),
      stderr: (t) => process.stderr.write(t),
    },
    browserDeps(),
  );
}
