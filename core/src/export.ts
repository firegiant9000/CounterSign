import { MIGRATIONS } from './migrations';
import type { Migration, RawExport } from './migrations';
import { APP_ID, emptySnapshot, SCHEMA_VERSION, STORES } from './schema';
import type { Deps, IsoInstant, Settings, Snapshot, StoreName } from './types';

export interface ExportFile {
  app: 'countersign';
  schemaVersion: number;
  exportedAt: IsoInstant;
  data: Snapshot;
  settings: Settings;
}

export type ParseResult =
  | { ok: true; file: ExportFile; counts: Record<StoreName, number> }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 20;

export function buildExport(
  data: Snapshot,
  settings: Settings,
  deps: Pick<Deps, 'now'>,
): ExportFile {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: deps.now(),
    data,
    settings,
  };
}

// Stores the restore would empty while they currently hold records.
export function emptiedStores(
  current: Snapshot,
  counts: Record<StoreName, number>,
): StoreName[] {
  const result: StoreName[] = [];
  for (const { name } of STORES) {
    const held: unknown = current[name];
    if (counts[name] === 0 && Array.isArray(held) && held.length > 0) {
      result.push(name);
    }
  }
  return result;
}

export function exportFileName(
  kind: 'export' | 'pre-restore',
  at: IsoInstant,
): string {
  const d = new Date(at);
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  const stamp =
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const prefix =
    kind === 'pre-restore'
      ? 'countersign-export-pre-restore'
      : 'countersign-export';
  return `${prefix}-${stamp}.json`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function fail(...errors: string[]): ParseResult {
  return { ok: false, errors };
}

function capErrors(errors: string[]): string[] {
  if (errors.length <= MAX_ERRORS) return errors;
  const rest = errors.length - MAX_ERRORS;
  return [...errors.slice(0, MAX_ERRORS), `and ${rest} more.`];
}

export function parseExport(
  text: string,
  options: { migrations?: readonly Migration[]; target?: number } = {},
): ParseResult {
  const migrations = options.migrations ?? MIGRATIONS;
  const target = options.target ?? SCHEMA_VERSION;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('This is not a JSON file.');
  }

  // Envelope
  if (!isPlainObject(parsed) || parsed['app'] !== APP_ID) {
    return fail('This is not a Countersign export.');
  }
  const version = parsed['schemaVersion'];
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return fail('The schema version is missing or not a whole number.');
  }
  if (version > target) {
    return fail(
      `This file was made by a newer version of Countersign (schema ${version}). Update the extension first.`,
    );
  }
  const rawData = parsed['data'];
  if (!isPlainObject(rawData)) return fail('The file has no data section.');
  const rawSettings = parsed['settings'];
  if (rawSettings !== undefined && !isPlainObject(rawSettings)) {
    return fail('The settings section is not an object.');
  }

  // Find the whole migration chain before running any step.
  const chain: Migration[] = [];
  for (let to = version + 1; to <= target; to += 1) {
    const step = migrations.find((m) => m.to === to);
    if (!step) {
      return fail(
        `No migration path from schema ${version} to schema ${target}.`,
      );
    }
    chain.push(step);
  }

  let raw: RawExport = {
    schemaVersion: version,
    data: rawData as Record<string, unknown[]>,
    settings: rawSettings ?? {},
  };
  for (const step of chain) {
    try {
      const next: unknown = step.migrate(raw);
      if (!isPlainObject(next) || !isPlainObject(next['data'])) {
        return fail(`The upgrade to schema ${step.to} failed.`);
      }
      raw = next as unknown as RawExport;
    } catch {
      return fail(`The upgrade to schema ${step.to} failed.`);
    }
  }
  const data: unknown = raw.data;
  const settings: unknown = raw.settings ?? {};
  if (!isPlainObject(data)) return fail('The file has no data section.');
  if (!isPlainObject(settings)) {
    return fail('The settings section is not an object.');
  }

  // Records
  const known = STORES.filter((s) => s.since <= target);
  const errors: string[] = [];
  const knownNames = new Set<string>(known.map((s) => s.name));
  for (const key of Object.keys(data)) {
    if (!knownNames.has(key)) errors.push(`Unknown store "${key}".`);
  }

  const out = emptySnapshot();
  const counts = {} as Record<StoreName, number>;
  for (const { name } of STORES) counts[name] = 0;

  for (const { name } of known) {
    const list = Object.prototype.hasOwnProperty.call(data, name)
      ? data[name]
      : [];
    if (!Array.isArray(list)) {
      errors.push(`${name} is not a list.`);
      continue;
    }
    const seen = new Set<string>();
    const reported = new Set<string>();
    list.forEach((record: unknown, i) => {
      if (!isPlainObject(record)) {
        errors.push(`${name}[${i}] is not a record.`);
        return;
      }
      const id = record['id'];
      if (!isNonEmptyString(id)) {
        errors.push(`${name}[${i}] has no id.`);
      }
      if (!isNonEmptyString(record['createdAt'])) {
        errors.push(`${name}[${i}] has no createdAt.`);
      }
      if (isNonEmptyString(id)) {
        if (seen.has(id)) {
          if (!reported.has(id)) {
            reported.add(id);
            errors.push(`${name} has two records with id "${id}".`);
          }
        } else {
          seen.add(id);
        }
      }
    });
    counts[name] = list.length;
    // Shape is checked above; an invalid store never reaches the caller.
    (out as unknown as Record<string, unknown[]>)[name] = list;
  }

  if (errors.length > 0) return { ok: false, errors: capErrors(errors) };

  const exportedAt = parsed['exportedAt'];
  return {
    ok: true,
    file: {
      app: APP_ID,
      schemaVersion: target,
      // ExportFile requires a string, so an absent timestamp reads as ''.
      exportedAt: typeof exportedAt === 'string' ? exportedAt : '',
      data: out,
      settings,
    },
    counts,
  };
}
