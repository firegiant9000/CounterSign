import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedDeps } from '../../core/testing/fixed-deps';
import { exportFileName, parseExport } from '../../core/src/export';
import { runImportSheet } from './cli';

const fixtures = (name: string) =>
  path.join(import.meta.dirname, 'fixtures', name);
const APPS = fixtures('applications.fixture.csv');
const HIST = fixtures('history.fixture.csv');
const FIRST_NOW = fixedDeps().now();

let out: string;
beforeEach(() => {
  out = mkdtempSync(path.join(tmpdir(), 'sheet-import-'));
});
afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

async function run(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runImportSheet(
    args,
    { stdout: (t) => stdout.push(t), stderr: (t) => stderr.push(t) },
    fixedDeps(),
  );
  return { code, stdout: stdout.join(''), stderr: stderr.join('') };
}

const base = [
  '--applications',
  APPS,
  '--history',
  HIST,
  '--undated-on',
  '2026-01-01',
];

describe('import-sheet', () => {
  it('dry run prints the report and writes nothing', async () => {
    const r = await run([...base, '--out', out, '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Applications: \d+ rows, \d+ imported/);
    expect(r.stdout).toContain('Skipped');
    expect(r.stdout).toContain('Flagged');
    expect(readdirSync(out)).toEqual([]);
  });

  it('dry run works without --out', async () => {
    const r = await run([...base, '--dry-run']);
    expect(r.code).toBe(0);
  });

  it('writes one export file that parseExport accepts', async () => {
    const r = await run([...base, '--out', out]);
    expect(r.code).toBe(0);
    const name = exportFileName('export', FIRST_NOW);
    expect(readdirSync(out)).toEqual([name]);
    expect(r.stdout).toContain(path.join(out, name));
    const parsed = parseExport(readFileSync(path.join(out, name), 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts.applications).toBe(12);
    expect(parsed.counts.companies).toBe(8);
    expect(parsed.counts.statusEvents).toBe(21);
    expect(parsed.file.data.documents).toEqual([]);
    expect(parsed.file.data.canonicalAnswers).toEqual([]);
    expect(parsed.file.settings).toEqual({});
  });

  it('refuses to overwrite an existing file', async () => {
    await run([...base, '--out', out]);
    const file = path.join(out, exportFileName('export', FIRST_NOW));
    const before = readFileSync(file, 'utf8');
    const r = await run([...base, '--out', out]);
    expect(r.code).toBe(1);
    expect(r.stderr).not.toBe('');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('dry run with a nonexistent --out exits 0 and creates nothing', async () => {
    const missing = path.join(out, 'nope');
    const r = await run([...base, '--out', missing, '--dry-run']);
    expect(r.code).toBe(0);
    expect(existsSync(missing)).toBe(false);
    expect(readdirSync(out)).toEqual([]);
  });

  it('writes nothing and exits 1 when validation fails', async () => {
    const stderr: string[] = [];
    const code = await runImportSheet(
      [...base, '--out', out],
      { stdout: () => undefined, stderr: (t) => stderr.push(t) },
      fixedDeps(),
      { validate: () => ({ ok: false, errors: ['boom'] }) },
    );
    expect(code).toBe(1);
    expect(stderr.join('')).toContain('boom');
    expect(readdirSync(out)).toEqual([]);
  });

  it('leaves an existing file alone when the open fails for any reason', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sheet-import-open-'));
    try {
      const target = path.join(dir, exportFileName('export', FIRST_NOW));
      writeFileSync(target, 'earlier export');
      const stderr: string[] = [];
      const code = await runImportSheet(
        [...base, '--out', dir],
        { stdout: () => undefined, stderr: (t) => stderr.push(t) },
        fixedDeps(),
        {
          openFile: () => {
            throw Object.assign(new Error('denied'), { code: 'EPERM' });
          },
        },
      );
      expect(code).toBe(1);
      expect(stderr.join('')).toContain('denied');
      expect(existsSync(target)).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('earlier export');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes the partial file when the write fails after a successful open', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sheet-import-write-'));
    try {
      const target = path.join(dir, exportFileName('export', FIRST_NOW));
      const code = await runImportSheet(
        [...base, '--out', dir],
        { stdout: () => undefined, stderr: () => undefined },
        fixedDeps(),
        {
          writeFd: () => {
            throw new Error('disk full');
          },
        },
      );
      expect(code).toBe(1);
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 when --history is missing', async () => {
    const r = await run(['--applications', APPS, '--out', out]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Usage');
  });

  it('exits 2 for an unknown flag', async () => {
    const r = await run([...base, '--out', out, '--bogus']);
    expect(r.code).toBe(2);
  });

  it('exits 2 for a bad --undated-on', async () => {
    const r = await run([
      '--applications',
      APPS,
      '--history',
      HIST,
      '--out',
      out,
      '--undated-on',
      '2026-13-40',
    ]);
    expect(r.code).toBe(2);
  });

  it('exits 1 when --out does not exist', async () => {
    const r = await run([...base, '--out', path.join(out, 'nope')]);
    expect(r.code).toBe(1);
  });

  it('exits 1 and writes nothing for a CSV with a wrong cell count', async () => {
    const bad = path.join(out, 'bad.csv');
    writeFileSync(bad, 'A,B,C\n1,2\n');
    const dest = mkdtempSync(path.join(tmpdir(), 'sheet-import-dest-'));
    try {
      const r = await run([
        '--applications',
        bad,
        '--history',
        HIST,
        '--out',
        dest,
      ]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('CSV line');
      expect(readdirSync(dest)).toEqual([]);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
