import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { FillWrite } from '../../core/src/fill/types';
import { FILL_TIMEOUT_MS, applyToPage, scanPage, type FillApi } from './inject';

const SCAN = { fields: [], frames: [], truncated: false };
const RESULT = { outcomes: [{ ref: 1, outcome: 'written' }], scan: SCAN };
const WRITES: FillWrite[] = [
  { ref: 1, kind: 'value', value: 'Ada Example' },
  { ref: 2, kind: 'option', index: 0 },
];

function fakeApi(
  tab: { id?: number; url?: string } | undefined,
  scan: () => Promise<unknown> = () => Promise.resolve(SCAN),
  apply: () => Promise<unknown> = () => Promise.resolve(RESULT),
): Pick<FillApi, 'activeTab'> & {
  scan: Mock<(tabId: number) => Promise<unknown>>;
  apply: Mock<
    (tabId: number, writes: readonly FillWrite[]) => Promise<unknown>
  >;
} {
  return {
    activeTab: () => Promise.resolve(tab),
    scan: vi.fn<(tabId: number) => Promise<unknown>>(scan),
    apply:
      vi.fn<(tabId: number, writes: readonly FillWrite[]) => Promise<unknown>>(
        apply,
      ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('scanPage', () => {
  it('returns the validated scan with the tab id and address', async () => {
    const api = fakeApi({ id: 7, url: '  https://example.com/apply  ' });
    expect(await scanPage(api)).toEqual({
      ok: true,
      tabId: 7,
      url: 'https://example.com/apply',
      scan: SCAN,
    });
    expect(api.scan).toHaveBeenCalledWith(7);
  });

  it('reports no_tab', async () => {
    expect(await scanPage(fakeApi(undefined))).toEqual({
      ok: false,
      reason: 'no_tab',
    });
    expect(await scanPage(fakeApi({ url: 'https://example.com/' }))).toEqual({
      ok: false,
      reason: 'no_tab',
    });
    const api: FillApi = {
      activeTab: () => Promise.reject(new Error('no window')),
      scan: vi.fn(),
      apply: vi.fn(),
    };
    expect(await scanPage(api)).toEqual({ ok: false, reason: 'no_tab' });
  });

  it.each([
    'about:addons',
    'moz-extension://x/popup.html',
    'file:///c:/x.html',
    undefined,
    '  ',
  ])('does not inject on a non-http page (%s)', async (url) => {
    const api = fakeApi({ id: 1, url });
    expect(await scanPage(api)).toEqual({ ok: false, reason: 'not_http' });
    expect(api.scan).not.toHaveBeenCalled();
  });

  it('refuses when the scan rejects', async () => {
    const api = fakeApi({ id: 1, url: 'https://example.com/' }, () =>
      Promise.reject(new Error('blocked')),
    );
    expect(await scanPage(api)).toEqual({ ok: false, reason: 'refused' });
  });

  it.each([undefined, 'x', { fields: 1 }])(
    'refuses a result that is not a scan (%j)',
    async (raw) => {
      const api = fakeApi({ id: 1, url: 'https://example.com/' }, () =>
        Promise.resolve(raw),
      );
      expect(await scanPage(api)).toEqual({ ok: false, reason: 'refused' });
    },
  );

  it('times out after 5 s and clears the timer', async () => {
    vi.useFakeTimers();
    const api = fakeApi({ id: 1, url: 'https://example.com/' }, () => {
      return new Promise(() => undefined);
    });
    const pending = scanPage(api);
    await vi.advanceTimersByTimeAsync(FILL_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, reason: 'refused' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the scan settles', async () => {
    vi.useFakeTimers();
    const api = fakeApi({ id: 1, url: 'https://example.com/' });
    await scanPage(api);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never calls apply', async () => {
    const api = fakeApi({ id: 1, url: 'https://example.com/' });
    await scanPage(api);
    expect(api.apply).not.toHaveBeenCalled();
  });
});

describe('applyToPage', () => {
  it('passes the tab id and the writes through unchanged', async () => {
    const api = fakeApi(undefined);
    await applyToPage(7, WRITES, api);
    expect(api.apply).toHaveBeenCalledTimes(1);
    const args = api.apply.mock.calls[0] as unknown[];
    expect(args[0]).toBe(7);
    expect(args[1]).toBe(WRITES);
  });

  it('returns the validated result', async () => {
    expect(await applyToPage(1, WRITES, fakeApi(undefined))).toEqual({
      ok: true,
      result: RESULT,
    });
  });

  it('fails when the script is not registered', async () => {
    const api = fakeApi(undefined, undefined, () => Promise.resolve(undefined));
    expect(await applyToPage(1, WRITES, api)).toEqual({ ok: false });
  });

  it('fails on a rejection', async () => {
    const api = fakeApi(undefined, undefined, () =>
      Promise.reject(new Error('gone')),
    );
    expect(await applyToPage(1, WRITES, api)).toEqual({ ok: false });
  });

  it('fails on a result that is not an apply result', async () => {
    const api = fakeApi(undefined, undefined, () =>
      Promise.resolve({ outcomes: 1 }),
    );
    expect(await applyToPage(1, WRITES, api)).toEqual({ ok: false });
  });

  it('times out after 5 s and clears the timer', async () => {
    vi.useFakeTimers();
    const api = fakeApi(undefined, undefined, () => {
      return new Promise(() => undefined);
    });
    const pending = applyToPage(1, WRITES, api);
    await vi.advanceTimersByTimeAsync(FILL_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the apply settles', async () => {
    vi.useFakeTimers();
    await applyToPage(1, WRITES, fakeApi(undefined));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never calls scan', async () => {
    const api = fakeApi(undefined);
    await applyToPage(1, WRITES, api);
    expect(api.scan).not.toHaveBeenCalled();
  });
});
