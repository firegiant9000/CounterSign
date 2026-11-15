import { browser } from 'wxt/browser';
import type { CaptureResult } from '../../core/src/jobposting';
import { MAX_POSTING_TEXT } from '../../core/src/jobposting';

export type CaptureOutcome =
  | { ok: true; capture: CaptureResult }
  | { ok: false; reason: 'no_tab' | 'refused'; url?: string };

export const MAX_CAPTURE_FIELD = 2_000;
export const MAX_CAPTURE_URL = 8_000;
export const CAPTURE_TIMEOUT_MS = 5_000;

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
const LIMITS: Record<(typeof TEXT_FIELDS)[number], number> = {
  relCanonical: MAX_CAPTURE_URL,
  title: MAX_CAPTURE_FIELD,
  companyName: MAX_CAPTURE_FIELD,
  location: MAX_CAPTURE_FIELD,
  text: MAX_POSTING_TEXT,
};

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
  const result: CaptureResult = {
    source,
    url: url.slice(0, MAX_CAPTURE_URL),
  };
  for (const key of TEXT_FIELDS) {
    const value = trimmed(raw[key]);
    if (value === undefined || value === '') continue;
    result[key] = value.slice(0, LIMITS[key]);
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
  const refused = refusal(tab.url);
  let raw: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        resolve(TIMED_OUT);
      }, CAPTURE_TIMEOUT_MS);
    });
    const result = await Promise.race([api.run(tab.id), timeout]);
    if (result === TIMED_OUT) return refused;
    raw = result;
  } catch {
    return refused;
  } finally {
    clearTimeout(timer);
  }
  const capture = toCaptureResult(raw, tab.url);
  return capture ? { ok: true, capture } : refused;
}

const TIMED_OUT = Symbol('timed out');

function refusal(tabUrl: string | undefined): CaptureOutcome {
  const url = trimmed(tabUrl);
  return url !== undefined && /^https?:\/\//i.test(url)
    ? { ok: false, reason: 'refused', url }
    : { ok: false, reason: 'refused' };
}
