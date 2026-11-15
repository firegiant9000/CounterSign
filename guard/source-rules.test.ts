import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { NETWORK_TOKENS, parseCsp, scanText, validateAllowlist } from './scan';

const eslint = new ESLint({ cwd: resolve(import.meta.dirname, '..') });

async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  return (await messages(code, filePath)).map((m) => m.ruleId ?? '');
}

describe('scanText', () => {
  it('finds each network token as a whole word', () => {
    for (const token of NETWORK_TOKENS) {
      expect(scanText('a.js', `x;${token}(1);`, [])).toHaveLength(1);
    }
  });
  it('ignores longer identifiers', () => {
    expect(scanText('a.js', 'prefetchCount=1;refetch()', [])).toEqual([]);
  });
  it('drops a hit that an allowlist entry explains', () => {
    const allow = [
      { token: 'fetch', near: 'errorMessage="fetch failed"', reason: 'test' },
    ];
    expect(scanText('a.js', 'var errorMessage="fetch failed";', allow)).toEqual(
      [],
    );
    expect(
      scanText('a.js', 'fetch("https://example.com")', allow),
    ).toHaveLength(1);
  });
  it('still reports a real fetch next to, but outside, an allowlisted near-string', () => {
    const allow = [
      { token: 'fetch', near: 'errorMessage="fetch failed"', reason: 'test' },
    ];
    const text = 'var errorMessage="fetch failed";fetch("https://example.com")';
    const hits = scanText('a.js', text, allow);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.context).toContain('fetch("https');
  });
  it('throws on an invalid allowlist', () => {
    expect(() =>
      scanText('a.js', 'x', [{ token: 'fetch', near: '', reason: 'r' }]),
    ).toThrow(/allowlist/i);
  });
});

describe('validateAllowlist', () => {
  const good = {
    token: 'fetch',
    near: 'errorMessage="fetch failed"',
    reason: 'a message string',
  };
  it('accepts a good entry', () => {
    expect(validateAllowlist([good])).toEqual([]);
  });
  it('rejects an unknown token', () => {
    expect(validateAllowlist([{ ...good, token: 'nope' }])).not.toEqual([]);
  });
  it('rejects an empty near', () => {
    expect(validateAllowlist([{ ...good, near: '' }])).not.toEqual([]);
  });
  it('rejects a near without the token as a whole word', () => {
    expect(
      validateAllowlist([{ ...good, near: 'prefetchCount=1234567890' }]),
    ).not.toEqual([]);
  });
  it('rejects a too-short near', () => {
    expect(validateAllowlist([{ ...good, near: 'a fetch' }])).not.toEqual([]);
  });
  it('rejects an empty reason', () => {
    expect(validateAllowlist([{ ...good, reason: '   ' }])).not.toEqual([]);
  });
});

describe('parseCsp', () => {
  it('maps directives to sorted source lists', () => {
    expect(
      parseCsp("default-src 'self'; connect-src 'none' api.example.com;"),
    ).toEqual({
      'default-src': ["'self'"],
      'connect-src': ["'none'", 'api.example.com'],
    });
  });
});

describe('lint rule', { timeout: 60_000 }, () => {
  it.each([
    "new WebTransport('https://example.com');",
    "importScripts('https://example.com/a.js');",
    "fetch('https://example.com');",
    'new XMLHttpRequest();',
    "new WebSocket('wss://example.com');",
    "new EventSource('https://example.com');",
    "navigator.sendBeacon('https://example.com');",
    "window.fetch('https://example.com');",
    "globalThis.fetch('https://example.com');",
  ])('rejects %s', async (code) => {
    const rules = await ruleIds(code, 'entrypoints/background.ts');
    expect(rules.some((id) => id.startsWith('no-restricted'))).toBe(true);
  });
});

describe('download guard', { timeout: 60_000 }, () => {
  const save = "browser.downloads.download({ url: 'blob:x' });";
  const message = 'Save files only through shell/files/download.ts.';
  it('rejects downloads.download outside the wrapper', async () => {
    const found = await messages(save, 'entrypoints/background.ts');
    expect(
      found.some(
        (m) => m.ruleId === 'no-restricted-syntax' && m.message === message,
      ),
    ).toBe(true);
  });
  it.each([
    'const { downloads } = browser; downloads.download({ url: "blob:x" });',
    "browser.downloads?.download?.({ url: 'blob:x' });",
    "browser.downloads['download']({ url: 'blob:x' });",
    "const d = browser.downloads; d.download({ url: 'blob:x' });",
    'const { download } = browser.downloads;',
    "browser['downloads'].download({ url: 'blob:x' });",
    'const { downloads } = browser;',
  ])('rejects the variant %s', async (code) => {
    const found = await messages(code, 'entrypoints/background.ts');
    expect(found.some((m) => m.message === message)).toBe(true);
  });
  it('allows downloads.download in the wrapper', async () => {
    const found = await messages(save, 'shell/files/download.ts');
    expect(found.some((m) => m.message === message)).toBe(false);
  });
  it('also applies the download guard in core/', async () => {
    const found = await messages(save, 'core/src/status.ts');
    expect(found.some((m) => m.message === message)).toBe(true);
  });
  it('keeps the network rule in the wrapper', async () => {
    const rules = await ruleIds(
      "navigator.sendBeacon('https://example.com');",
      'shell/files/download.ts',
    );
    expect(rules).toContain('no-restricted-syntax');
  });
});

describe('navigation and injection guard', { timeout: 60_000 }, () => {
  const navMessage = 'Countersign never navigates away or opens windows.';
  const tabsMessage =
    'Use tabs only in open-dashboard.ts or capture/inject.ts.';
  const scriptingMessage = 'Inject only through shell/capture/inject.ts.';
  const dashboard = 'shell/open-dashboard.ts';
  const inject = 'shell/capture/inject.ts';
  const save = "browser.downloads.download({ url: 'blob:x' });";
  // Probe paths such as shell/ui/x.tsx and shell/capture/inject.ts do not exist
  // on disk, so type-aware parsing would fail. Switch type information off;
  // no-restricted-syntax from eslint.config.js still applies by file path.
  const syntaxLint = new ESLint({
    cwd: resolve(import.meta.dirname, '..'),
    overrideConfig: tseslint.configs.disableTypeChecked,
  });
  async function syntaxMessages(code: string, filePath: string) {
    const [result] = await syntaxLint.lintText(code, { filePath });
    const found = result?.messages ?? [];
    expect(found.filter((m) => m.fatal)).toEqual([]);
    return found;
  }

  it.each([
    "window.open('https://example.com');",
    "window['open']('https://example.com');",
    "open('https://example.com');",
    "location.assign('https://example.com');",
    "location.replace('https://example.com');",
    'location.reload();',
    "window.location.assign('https://example.com');",
    "location = 'https://example.com';",
    "window.location = 'https://example.com';",
    "document.location = 'https://example.com';",
    "location.href = 'https://example.com';",
    "window.location.href = 'https://example.com';",
    "document.location.href = 'https://example.com';",
    "location['href'] = 'https://example.com';",
    "window.location['href'] = 'https://example.com';",
    "location['assign']('https://example.com');",
    "location['replace']('https://example.com');",
    "location['reload']();",
    "window.location['assign']('https://example.com');",
    "globalThis.open('https://example.com');",
    "self.open('https://example.com');",
    "top.location = 'https://example.com';",
    "parent.location = 'https://example.com';",
    "globalThis.location = 'https://example.com';",
    "self.location = 'https://example.com';",
  ])('rejects navigation %s', async (code) => {
    const found = await syntaxMessages(code, 'shell/ui/x.tsx');
    expect(found.some((m) => m.message === navMessage)).toBe(true);
  });
  it.each([
    "location.hash = '#/data';",
    "job.location = 'Remote';",
    "indexedDB.open('db', 1);",
    'window.close();',
    "location['hash'] = '#/data';",
  ])('allows %s', async (code) => {
    const found = await syntaxMessages(code, 'shell/ui/x.tsx');
    expect(found.some((m) => m.message === navMessage)).toBe(false);
  });
  it.each([
    'browser.tabs.query({});',
    "browser['tabs'].query({});",
    'const { tabs } = browser;',
  ])('rejects tabs access %s outside the allowed files', async (code) => {
    const found = await syntaxMessages(code, 'shell/ui/x.tsx');
    expect(found.some((m) => m.message === tabsMessage)).toBe(true);
  });
  it.each([dashboard, inject])('allows tabs access in %s', async (file) => {
    const found = await syntaxMessages('browser.tabs.query({});', file);
    expect(found.some((m) => m.message === tabsMessage)).toBe(false);
  });
  it.each([
    'browser.scripting.executeScript({});',
    "browser['scripting'].executeScript({});",
    'const { scripting } = browser;',
  ])('rejects scripting access %s outside inject.ts', async (code) => {
    for (const file of ['shell/ui/x.tsx', dashboard]) {
      const found = await syntaxMessages(code, file);
      expect(found.some((m) => m.message === scriptingMessage)).toBe(true);
    }
  });
  it('allows scripting access in inject.ts', async () => {
    const found = await syntaxMessages(
      'browser.scripting.executeScript({});',
      inject,
    );
    expect(found.some((m) => m.message === scriptingMessage)).toBe(false);
  });
  it('rejects tabs access in the download wrapper', async () => {
    const found = await syntaxMessages(
      'browser.tabs.query({});',
      'shell/files/download.ts',
    );
    expect(found.some((m) => m.message === tabsMessage)).toBe(true);
  });
  it.each([dashboard, inject])(
    'keeps the download, network and navigation rules in %s',
    async (file) => {
      for (const [code, message] of [
        [save, 'Save files only through shell/files/download.ts.'],
        [
          "navigator.sendBeacon('https://example.com');",
          'This extension makes no network requests.',
        ],
        ['location.reload();', navMessage],
      ] as const) {
        const found = await syntaxMessages(code, file);
        expect(found.some((m) => m.message === message)).toBe(true);
      }
    },
  );
  it('applies the navigation guard in core/', async () => {
    const found = await syntaxMessages(
      'location.reload();',
      'core/src/status.ts',
    );
    expect(found.some((m) => m.message === navMessage)).toBe(true);
  });
});

describe(
  'core/ restrictions still bite alongside the network rules',
  { timeout: 60_000 },
  () => {
    it('rejects fetch in core/', async () => {
      const rules = await ruleIds(
        "fetch('https://example.com');",
        'core/src/status.ts',
      );
      expect(rules.some((id) => id.startsWith('no-restricted'))).toBe(true);
    });
    it('rejects the DOM in core/', async () => {
      const rules = await ruleIds('document.title;', 'core/src/status.ts');
      expect(rules).toContain('no-restricted-globals');
    });
    it('rejects fetch in core/ with the network message', async () => {
      const found = await messages(
        "fetch('https://example.com');",
        'core/src/status.ts',
      );
      expect(found.some((m) => m.message.includes('network'))).toBe(true);
    });
    it('rejects preact imports in core/', async () => {
      const rules = await ruleIds(
        "import { h } from 'preact';",
        'core/src/status.ts',
      );
      expect(rules).toContain('no-restricted-imports');
    });
    it('rejects shell imports in core/', async () => {
      const rules = await ruleIds(
        "import x from '../../shell/x';",
        'core/src/status.ts',
      );
      expect(rules).toContain('no-restricted-imports');
    });
  },
);
