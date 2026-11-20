import { browser } from 'wxt/browser';
import type {
  ApplyResult,
  FillWrite,
  FormScan,
} from '../../core/src/fill/types';
import { toApplyResult, toFormScan } from '../../core/src/fill/validate';

export const FILL_TIMEOUT_MS = 5_000;

export interface FillApi {
  activeTab(): Promise<{ id?: number; url?: string } | undefined>;
  scan(tabId: number): Promise<unknown>;
  apply(tabId: number, writes: readonly FillWrite[]): Promise<unknown>;
}

export const browserFillApi: FillApi = {
  async activeTab() {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tabs[0];
  },
  async scan(tabId) {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      files: ['/fill.js'],
    });
    return results[0]?.result;
  },
  async apply(tabId, writes) {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      // Serialised into the page: it must reference nothing outside itself.
      func: (w: unknown) =>
        (
          globalThis as {
            __countersignFill?: { apply(w: unknown): unknown };
          }
        ).__countersignFill?.apply(w),
      args: [writes],
    });
    return results[0]?.result;
  },
};

export type ScanOutcome =
  | { ok: true; tabId: number; url: string; scan: FormScan }
  | { ok: false; reason: 'no_tab' | 'not_http' | 'refused' };

export type ApplyOutcome = { ok: true; result: ApplyResult } | { ok: false };

const TIMED_OUT = Symbol('timed out');

/** Resolves with the call's value, or undefined on rejection or timeout. */
async function raced(call: () => Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        resolve(TIMED_OUT);
      }, FILL_TIMEOUT_MS);
    });
    const result = await Promise.race([call(), timeout]);
    return result === TIMED_OUT ? undefined : result;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function scanPage(
  api: FillApi = browserFillApi,
): Promise<ScanOutcome> {
  let tab: { id?: number; url?: string } | undefined;
  try {
    tab = await api.activeTab();
  } catch {
    return { ok: false, reason: 'no_tab' };
  }
  if (typeof tab?.id !== 'number') return { ok: false, reason: 'no_tab' };
  const url = typeof tab.url === 'string' ? tab.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: 'not_http' };
  const tabId = tab.id;
  const scan = toFormScan(await raced(() => api.scan(tabId)));
  return scan
    ? { ok: true, tabId, url, scan }
    : { ok: false, reason: 'refused' };
}

export async function applyToPage(
  tabId: number,
  writes: readonly FillWrite[],
  api: FillApi = browserFillApi,
): Promise<ApplyOutcome> {
  const result = toApplyResult(await raced(() => api.apply(tabId, writes)));
  return result ? { ok: true, result } : { ok: false };
}
