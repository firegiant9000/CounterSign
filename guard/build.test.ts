import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import allowlist from './allowlist.json';
import { scanDirectory, type AllowEntry } from './scan';

const OUT = resolve(import.meta.dirname, '..', '.output', 'firefox-mv3');
const MANIFEST = join(OUT, 'manifest.json');

if (!existsSync(MANIFEST)) {
  throw new Error(
    `Built manifest not found at ${MANIFEST}. Run "npm run build" before the build tests.`,
  );
}

interface BuiltManifest {
  manifest_version?: number;
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  optional_permissions?: string[];
  content_scripts?: unknown[];
  web_accessible_resources?: unknown[];
  content_security_policy?: { extension_pages?: string };
  background?: {
    scripts?: string[];
    service_worker?: string;
    persistent?: boolean;
  };
  browser_specific_settings?: {
    gecko?: {
      id?: string;
      strict_min_version?: string;
      data_collection_permissions?: unknown;
    };
  };
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as BuiltManifest;

const ALLOWED = [
  'activeTab',
  'alarms',
  'downloads',
  'scripting',
  'storage',
  'unlimitedStorage',
];

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

describe('built extension', () => {
  it('is Manifest V3', () => expect(manifest.manifest_version).toBe(3));
  it('asks only for allowed permissions', () => {
    for (const p of manifest.permissions ?? []) expect(ALLOWED).toContain(p);
  });
  it('has no host access', () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();
  });
  it('declares no content scripts or web-accessible resources', () => {
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });
  it('blocks every connection on extension pages', () => {
    const csp = manifest.content_security_policy?.extension_pages ?? '';
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/https?:|wss?:|\*/);
  });
  it('uses an event page, not a service worker', () => {
    expect(Array.isArray(manifest.background?.scripts)).toBe(true);
    expect(manifest.background?.service_worker).toBeUndefined();
    expect(manifest.background?.persistent).not.toBe(true);
  });
  it('declares its identity and no data collection', () => {
    const gecko = manifest.browser_specific_settings?.gecko;
    expect(gecko?.id).toBe('countersign@firegiant9000');
    expect(gecko?.strict_min_version).toBe('140.0');
    expect(gecko?.data_collection_permissions).toEqual({ required: ['none'] });
  });
  it('ships no network calls', () => {
    expect(scanDirectory(OUT, allowlist as AllowEntry[])).toEqual([]);
  });
  it('loads nothing remote from its pages', () => {
    const files = htmlFiles(OUT);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(
        /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      )) {
        const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        expect(value, `${file}: ${value}`).not.toMatch(
          /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i,
        );
      }
    }
  });
});
