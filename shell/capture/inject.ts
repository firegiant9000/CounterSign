import { browser } from 'wxt/browser';
import type { CaptureResult } from '../../core/src/jobposting';
import { MAX_POSTING_TEXT } from '../../core/src/jobposting';

export type CaptureOutcome =
  | { ok: true; capture: CaptureResult }
  | { ok: false; reason: 'no_tab' | 'refused' };

export interface CaptureApi {
  activeTab(): Promise<{ id?: number; url?: string } | undefined>;
  run(tabId: number): Promise<unknown>;
}

const SOURCES = ['jsonld', 'selection', 'none'] as const;
const TEXT_FIELDS = [
  'relCanonical',
  'title',
  'companyName',
  'location',
  'text',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function toCaptureResult(
  raw: unknown,
  tabUrl: string | undefined,
): CaptureResult | undefined {
  if (!isPlainObject(raw)) return undefined;
  const source = SOURCES.find((s) => s === raw.source) ?? 'none';
  const tab = trimmed(tabUrl);
  const url = tab !== undefined && tab !== '' ? tab : (trimmed(raw.url) ?? '');
  const result: CaptureResult = { source, url };
  for (const key of TEXT_FIELDS) {
    const value = trimmed(raw[key]);
    if (value === undefined) continue;
    result[key] = key === 'text' ? value.slice(0, MAX_POSTING_TEXT) : value;
  }
  return result;
}

export const browserCaptureApi: CaptureApi = {
  async activeTab() {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tabs[0];
  },
  async run(tabId) {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      files: ['/capture.js'],
    });
    return results[0]?.result;
  },
};

export async function capturePage(
  api: CaptureApi = browserCaptureApi,
): Promise<CaptureOutcome> {
  let tab: { id?: number; url?: string } | undefined;
  try {
    tab = await api.activeTab();
  } catch {
    return { ok: false, reason: 'no_tab' };
  }
  if (tab?.id === undefined) return { ok: false, reason: 'no_tab' };
  let raw: unknown;
  try {
    raw = await api.run(tab.id);
  } catch {
    return { ok: false, reason: 'refused' };
  }
  const capture = toCaptureResult(raw, tab.url);
  return capture ? { ok: true, capture } : { ok: false, reason: 'refused' };
}
