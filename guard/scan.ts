import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NETWORK_TOKENS: readonly string[] = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'WebTransport',
  'RTCPeerConnection',
];

export interface AllowEntry {
  token: string;
  near: string;
  reason: string;
}

export interface Hit {
  file: string;
  token: string;
  context: string;
}

export interface ScanResult {
  hits: Hit[];
  /** Indexes of allowlist entries that suppressed at least one hit. */
  usedEntries: Set<number>;
}

const CONTEXT = 60;
const MIN_NEAR_EXTRA = 10;

function tokenPattern(token: string): RegExp {
  return new RegExp(`(?<![\\w$])${token}(?![\\w$])`, 'g');
}

/** Returns a list of problems; an empty list means the allowlist is valid. */
export function validateAllowlist(allow: readonly AllowEntry[]): string[] {
  const problems: string[] = [];
  allow.forEach((entry, i) => {
    const label = `allowlist[${i}]`;
    if (!NETWORK_TOKENS.includes(entry.token)) {
      problems.push(`${label}: unknown token "${entry.token}"`);
      return;
    }
    if (!tokenPattern(entry.token).test(entry.near)) {
      problems.push(`${label}: near must contain "${entry.token}" as a word`);
    }
    if (entry.near.length < entry.token.length + MIN_NEAR_EXTRA) {
      problems.push(
        `${label}: near must be at least ${MIN_NEAR_EXTRA} characters longer than the token`,
      );
    }
    if (entry.reason.trim() === '') {
      problems.push(`${label}: reason must not be empty`);
    }
  });
  return problems;
}

export function scanTextWithUsage(
  file: string,
  text: string,
  allow: readonly AllowEntry[],
): ScanResult {
  const problems = validateAllowlist(allow);
  if (problems.length > 0) {
    throw new Error(`Invalid allowlist: ${problems.join('; ')}`);
  }
  const hits: Hit[] = [];
  const usedEntries = new Set<number>();
  for (const token of NETWORK_TOKENS) {
    for (const match of text.matchAll(tokenPattern(token))) {
      const start = match.index;
      const end = start + token.length;
      let explained = false;
      allow.forEach((entry, i) => {
        if (entry.token !== token) return;
        let from = text.indexOf(entry.near);
        while (from !== -1) {
          if (from <= start && end <= from + entry.near.length) {
            usedEntries.add(i);
            explained = true;
            return;
          }
          from = text.indexOf(entry.near, from + 1);
        }
      });
      if (!explained) {
        hits.push({
          file,
          token,
          context: text.slice(Math.max(0, start - CONTEXT), end + CONTEXT),
        });
      }
    }
  }
  return { hits, usedEntries };
}

export function scanText(
  file: string,
  text: string,
  allow: readonly AllowEntry[],
): Hit[] {
  return scanTextWithUsage(file, text, allow).hits;
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (/\.(js|html)$/.test(entry.name)) files.push(path);
  }
  return files;
}

export function scanDirectoryWithUsage(
  dir: string,
  allow: readonly AllowEntry[],
): ScanResult {
  const hits: Hit[] = [];
  const usedEntries = new Set<number>();
  const problems = validateAllowlist(allow);
  if (problems.length > 0) {
    throw new Error(`Invalid allowlist: ${problems.join('; ')}`);
  }
  for (const file of listFiles(dir)) {
    const result = scanTextWithUsage(file, readFileSync(file, 'utf8'), allow);
    hits.push(...result.hits);
    for (const i of result.usedEntries) usedEntries.add(i);
  }
  return { hits, usedEntries };
}

export function scanDirectory(
  dir: string,
  allow: readonly AllowEntry[],
): Hit[] {
  return scanDirectoryWithUsage(dir, allow).hits;
}

/** Parses a CSP into directive -> sorted source list. */
export function parseCsp(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    const [name, ...sources] = words;
    if (name === undefined) continue;
    out[name] = sources.sort();
  }
  return out;
}
