import { describe, expect, it } from 'vitest';
import { MAX_POSTING_TEXT } from '../../core/src/jobposting';
import { capturePage, toCaptureResult, type CaptureApi } from './inject';

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
