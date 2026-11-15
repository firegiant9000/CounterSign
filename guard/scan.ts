import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NETWORK_TOKENS: readonly string[] = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
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

const CONTEXT = 60;

export function scanText(
  file: string,
  text: string,
  allow: readonly AllowEntry[],
): Hit[] {
  const hits: Hit[] = [];
  for (const token of NETWORK_TOKENS) {
    const pattern = new RegExp(`(?<![\\w$])${token}(?![\\w$])`, 'g');
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const context = text.slice(
        Math.max(0, start - CONTEXT),
        start + token.length + CONTEXT,
      );
      const explained = allow.some(
        (entry) => entry.token === token && context.includes(entry.near),
      );
      if (!explained) hits.push({ file, token, context });
    }
  }
  return hits;
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

export function scanDirectory(
  dir: string,
  allow: readonly AllowEntry[],
): Hit[] {
  return listFiles(dir).flatMap((file) =>
    scanText(file, readFileSync(file, 'utf8'), allow),
  );
}
