import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_POSTING_TEXT } from '../../core/src/jobposting';
import {
  CAPTURE_TIMEOUT_MS,
  MAX_CAPTURE_FIELD,
  MAX_CAPTURE_URL,
  capturePage,
  toCaptureResult,
  type CaptureApi,
} from './inject';

function fakeApi(
  tab: { id?: number; url?: string } | undefined,
  run: () => Promise<unknown>,
): CaptureApi {
  return { activeTab: () => Promise.resolve(tab), run };
}

describe('capturePage', () => {
  it('returns the capture with the tab url preferred', async () => {
    const api = fakeApi({ id: 1, url: 'https://example.com/tab' }, () =>
      Promise.resolve({
        source: 'jsonld',
        url: 'https://example.com/page',
        title: '  Engineer ',
      }),
    );
    expect(await capturePage(api)).toEqual({
      ok: true,
      capture: {
        source: 'jsonld',
        url: 'https://example.com/tab',
        title: 'Engineer',
      },
    });
  });

  it('refuses when run rejects', async () => {
    const api = fakeApi({ id: 1 }, () => Promise.reject(new Error('blocked')));
    expect(await capturePage(api)).toEqual({ ok: false, reason: 'refused' });
  });

  it.each([undefined, 'text', [1, 2]])(
    'refuses a non-object result %j',
    async (raw) => {
      const api = fakeApi({ id: 1 }, () => Promise.resolve(raw));
      expect(await capturePage(api)).toEqual({ ok: false, reason: 'refused' });
    },
  );

  it('reports no_tab when there is no tab or no id', async () => {
    const run = () => Promise.resolve({ source: 'none', url: '' });
    expect(await capturePage(fakeApi(undefined, run))).toEqual({
      ok: false,
      reason: 'no_tab',
    });
    expect(
      await capturePage(fakeApi({ url: 'https://example.com' }, run)),
    ).toEqual({
      ok: false,
      reason: 'no_tab',
    });
  });
});

describe('capturePage hardening', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('times out a run that never resolves and clears the timer', async () => {
    vi.useFakeTimers();
    const api = fakeApi(
      { id: 1, url: 'https://example.com/p' },
      () => new Promise(() => undefined),
    );
    const pending = capturePage(api);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS);
    expect(await pending).toEqual({
      ok: false,
      reason: 'refused',
      url: 'https://example.com/p',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when run settles', async () => {
    vi.useFakeTimers();
    const api = fakeApi({ id: 1 }, () =>
      Promise.resolve({ source: 'none', url: '' }),
    );
    await capturePage(api);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports no_tab when activeTab rejects', async () => {
    const api: CaptureApi = {
      activeTab: () => Promise.reject(new Error('x')),
      run: () => Promise.resolve({}),
    };
    expect(await capturePage(api)).toEqual({ ok: false, reason: 'no_tab' });
  });

  it('refuses on an empty results array (undefined result)', async () => {
    const api = fakeApi({ id: 1 }, () => Promise.resolve(undefined));
    expect(await capturePage(api)).toEqual({ ok: false, reason: 'refused' });
  });

  it('uses the object url when the tab url is undefined', async () => {
    const api = fakeApi({ id: 1 }, () =>
      Promise.resolve({ source: 'selection', url: ' https://example.com/o ' }),
    );
    expect(await capturePage(api)).toEqual({
      ok: true,
      capture: { source: 'selection', url: 'https://example.com/o' },
    });
  });

  it('carries an http(s) tab url on refusal and omits other schemes', async () => {
    const fail = () => Promise.reject(new Error('blocked'));
    expect(
      await capturePage(fakeApi({ id: 1, url: 'HTTPS://example.com/a' }, fail)),
    ).toEqual({ ok: false, reason: 'refused', url: 'HTTPS://example.com/a' });
    expect(
      await capturePage(fakeApi({ id: 1, url: 'about:addons' }, fail)),
    ).toEqual({ ok: false, reason: 'refused' });
    expect(await capturePage(fakeApi({ id: 1, url: '  ' }, fail))).toEqual({
      ok: false,
      reason: 'refused',
    });
  });
});

describe('toCaptureResult limits', () => {
  it('drops whitespace-only strings for every field', () => {
    expect(
      toCaptureResult(
        {
          source: 'jsonld',
          url: 'https://example.com/a',
          title: '   ',
          companyName: '',
          location: ' ',
          text: '\n',
          relCanonical: ' ',
        },
        undefined,
      ),
    ).toEqual({ source: 'jsonld', url: 'https://example.com/a' });
  });

  it('caps field and url lengths', () => {
    const result = toCaptureResult(
      {
        source: 'jsonld',
        url: 'https://example.com/' + 'u'.repeat(9_000),
        relCanonical: 'https://example.com/' + 'c'.repeat(9_000),
        title: 't'.repeat(3_000),
        companyName: 'c'.repeat(3_000),
        location: 'l'.repeat(3_000),
      },
      undefined,
    );
    expect(result?.title).toHaveLength(MAX_CAPTURE_FIELD);
    expect(result?.companyName).toHaveLength(MAX_CAPTURE_FIELD);
    expect(result?.location).toHaveLength(MAX_CAPTURE_FIELD);
    expect(result?.url).toHaveLength(MAX_CAPTURE_URL);
    expect(result?.relCanonical).toHaveLength(MAX_CAPTURE_URL);
  });
});

describe('toCaptureResult', () => {
  it('drops non-string fields, maps unknown source to none, caps text', () => {
    const result = toCaptureResult(
      {
        source: 'evil',
        title: 42,
        text: 'x'.repeat(MAX_POSTING_TEXT + 10),
        extra: 'no',
      },
      undefined,
    );
    expect(result).toEqual({
      source: 'none',
      url: '',
      text: 'x'.repeat(MAX_POSTING_TEXT),
    });
  });

  it('falls back to the object url when the tab url is blank', () => {
    expect(
      toCaptureResult(
        { source: 'selection', url: 'https://example.com/a' },
        '  ',
      ),
    ).toEqual({
      source: 'selection',
      url: 'https://example.com/a',
    });
  });

  it('rejects non-plain objects', () => {
    expect(toCaptureResult(null, 'https://example.com')).toBeUndefined();
    expect(toCaptureResult(new Date(), 'https://example.com')).toBeUndefined();
  });
});
