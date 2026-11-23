import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  assetExists,
  cssProblems,
  FILL_TOKENS,
  fontFamiliesIn,
  NETWORK_TOKENS,
  parseCsp,
  scanText,
  scanTextWithUsage,
  validateAllowlist,
} from './scan';

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
  it('finds each fill token as a whole word', () => {
    for (const token of FILL_TOKENS) {
      expect(
        scanTextWithUsage('fill.js', `x.${token}()`, [], FILL_TOKENS).hits,
      ).toHaveLength(1);
    }
  });
  it('ignores longer words', () => {
    expect(
      scanTextWithUsage(
        'fill.js',
        'submitted=1;onclick;clicked()',
        [],
        FILL_TOKENS,
      ).hits,
    ).toEqual([]);
  });
  it('the network scan ignores fill words', () => {
    expect(scanText('a.js', 'form.submit()', [])).toEqual([]);
  });
  it('an allowlist entry may name a fill token', () => {
    const allow = [
      { token: 'click', near: 'label:"click to expand"', reason: 'test' },
    ];
    expect(validateAllowlist(allow)).toEqual([]);
    const text = 'x={label:"click to expand"};y.click()';
    const result = scanTextWithUsage('fill.js', text, allow, FILL_TOKENS);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.context).toContain('y.click()');
    expect(
      scanTextWithUsage(
        'fill.js',
        'label:"click to expand";fetch(1)',
        allow,
        FILL_TOKENS,
      ).hits,
    ).toEqual([]);
  });
  it('a fill entry never hides a network hit, nor a network entry a fill hit', () => {
    const fillEntry = [
      { token: 'click', near: 'label:"click to expand"', reason: 'test' },
    ];
    expect(
      scanText('a.js', 'label:"click to expand";fetch(1)', fillEntry),
    ).toHaveLength(1);
    const netEntry = [
      { token: 'fetch', near: 'errorMessage="fetch failed"', reason: 'test' },
    ];
    expect(
      scanTextWithUsage(
        'fill.js',
        'errorMessage="fetch failed";x.click()',
        netEntry,
        FILL_TOKENS,
      ).hits,
    ).toHaveLength(1);
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

describe('cssProblems', () => {
  const yes = (): boolean => true;
  const no = (): boolean => false;
  it.each([
    'a{src:url(data:font/woff2;base64,AA)}',
    'a{src:url("https://example.com/a.woff2")}',
    'a{src:url(//example.com/a)}',
    '@import "x.css";',
    '@IMPORT url(x.css);',
  ])('flags %s', (css) => {
    const found = cssProblems('a.css', css, yes);
    expect(found.length).toBeGreaterThanOrEqual(1);
    if (!css.toLowerCase().includes('@import')) expect(found).toHaveLength(1);
  });
  it.each([
    "a{b:url( 'https://example.com/x' )}",
    'a{b:url( https://example.com/x )}',
    'a{b:url( "//example.com/x" )}',
  ])('flags spaced or quoted remote %s', (css) => {
    expect(cssProblems('a.css', css, yes)).toHaveLength(1);
  });
  it('flags a missing single-quoted asset', () => {
    expect(cssProblems('a.css', "a{b:url('/missing.png')}", no)).toHaveLength(
      1,
    );
  });
  it('flags a missing space-padded unquoted asset', () => {
    expect(cssProblems('a.css', 'a{b:url( /missing.png )}', no)).toHaveLength(
      1,
    );
  });
  it('flags a missing asset', () => {
    expect(
      cssProblems('a.css', 'a{src:url(/theme/fonts/missing.woff2)}', no),
    ).toHaveLength(1);
  });
  it('accepts an existing asset with a query string', () => {
    expect(
      cssProblems('a.css', "a{b:url( '/theme/grain.png?v=1' )}", yes),
    ).toEqual([]);
  });
  it('strips fragments before the existence check', () => {
    const seen: string[] = [];
    cssProblems('a.css', 'a{b:url(x.svg#f)}', (p) => {
      seen.push(p);
      return true;
    });
    expect(seen).toEqual(['x.svg']);
  });
  it('reads font families from @font-face', () => {
    const css =
      '@font-face{font-family:"EB Garamond";src:url(/a.woff2)}' +
      '@font-face{font-family:Fraunces;src:url(/b.woff2)}' +
      'p{font-family:Other}';
    expect(fontFamiliesIn(css)).toEqual(new Set(['EB Garamond', 'Fraunces']));
  });
});

describe('assetExists', () => {
  const out = resolve('/ext/out');
  const css = resolve(out, 'assets', 'app.css');
  function probe(path: string, answer = true) {
    const asked: string[] = [];
    const found = assetExists(out, css, path, (p) => {
      asked.push(p);
      return answer;
    });
    return { found, asked };
  }
  it('resolves a root path under the output folder', () => {
    expect(probe('/theme/grain.png')).toEqual({
      found: true,
      asked: [resolve(out, 'theme', 'grain.png')],
    });
  });
  it('resolves a relative path against the CSS file folder', () => {
    expect(probe('fonts/a.woff2').asked).toEqual([
      resolve(out, 'assets', 'fonts', 'a.woff2'),
    ]);
  });
  it('resolves ../ against the CSS file folder', () => {
    expect(probe('../theme/grain.png').asked).toEqual([
      resolve(out, 'theme', 'grain.png'),
    ]);
  });
  it('reports what the file system reports', () => {
    expect(probe('/theme/grain.png', false).found).toBe(false);
  });
  it.each(['/../x', '../../x', '/theme/../../x', '/', '..'])(
    'rejects %s without asking the file system',
    (path) => {
      expect(probe(path)).toEqual({ found: false, asked: [] });
    },
  );
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
    'Use tabs only in open-dashboard.ts, capture/inject.ts or fill/inject.ts.';
  const notifyMessage =
    'Use notifications and permissions only in shell/notify.ts.';
  const scriptingMessage =
    'Inject only through shell/capture/inject.ts or shell/fill/inject.ts.';
  const dashboard = 'shell/open-dashboard.ts';
  const inject = 'shell/capture/inject.ts';
  const fillInject = 'shell/fill/inject.ts';
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
  it.each([dashboard, inject, fillInject])(
    'allows tabs access in %s',
    async (file) => {
      const found = await syntaxMessages('browser.tabs.query({});', file);
      expect(found.some((m) => m.message === tabsMessage)).toBe(false);
    },
  );
  it.each([
    "browser.notifications.create('x', {});",
    "browser['notifications'].create('x', {});",
    "browser.permissions.request({ permissions: ['notifications'] });",
    "browser['permissions'].request({});",
  ])(
    'rejects notifications and permissions access %s outside notify.ts',
    async (code) => {
      for (const file of [
        'shell/ui/SettingsPage.tsx',
        'entrypoints/background.ts',
      ]) {
        const found = await syntaxMessages(code, file);
        expect(found.some((m) => m.message === notifyMessage)).toBe(true);
      }
    },
  );
  it('allows notifications and permissions access in notify.ts', async () => {
    const found = await syntaxMessages(
      "browser.notifications.create('x', {}); browser.permissions.request({ permissions: ['notifications'] });",
      'shell/notify.ts',
    );
    expect(found.some((m) => m.message === notifyMessage)).toBe(false);
  });
  it('allows the permissions key in an object literal', async () => {
    const found = await syntaxMessages(
      "export default { permissions: ['storage'] };",
      'entrypoints/background.ts',
    );
    expect(found.some((m) => m.message === notifyMessage)).toBe(false);
  });
  it.each([
    'browser.scripting.executeScript({});',
    "browser['scripting'].executeScript({});",
    'const { scripting } = browser;',
  ])('rejects scripting access %s outside inject.ts', async (code) => {
    for (const file of [
      'shell/ui/x.tsx',
      dashboard,
      'shell/fill/controller.ts',
      'shell/fill/page/scan.ts',
    ]) {
      const found = await syntaxMessages(code, file);
      expect(found.some((m) => m.message === scriptingMessage)).toBe(true);
    }
  });
  it.each([inject, fillInject])(
    'allows scripting access in %s',
    async (file) => {
      const found = await syntaxMessages(
        'browser.scripting.executeScript({});',
        file,
      );
      expect(found.some((m) => m.message === scriptingMessage)).toBe(false);
    },
  );
  it('rejects tabs access in the download wrapper', async () => {
    const found = await syntaxMessages(
      'browser.tabs.query({});',
      'shell/files/download.ts',
    );
    expect(found.some((m) => m.message === tabsMessage)).toBe(true);
  });
  it.each([dashboard, inject, fillInject])(
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
  it.each([
    [
      "import { applyToPage } from '../fill/inject';",
      'shell/ui/FillSection.tsx',
    ],
    ["import { applyToPage } from './inject';", 'shell/fill/other.ts'],
    ["import { browserFillApi } from '../fill/inject';", 'shell/ui/Popup.tsx'],
    ["import * as inject from '../fill/inject';", 'shell/ui/x.tsx'],
    ["export { applyToPage } from './inject';", 'shell/fill/index.ts'],
    ["export * from './inject';", 'shell/fill/index.ts'],
    ["import { applyToPage } from '../fill/inject.js';", 'shell/ui/x.tsx'],
  ])('rejects the apply import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });
  it.each([
    ["const m = await import('./inject');", 'shell/fill/other.ts'],
    ["const m = await import('./inject');", 'shell/fill/controller.ts'],
    ["const m = await import('../fill/inject');", 'shell/ui/x.tsx'],
  ])('rejects the dynamic import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(
      found.some(
        (m) =>
          m.message ===
          'Only shell/fill/controller.ts may import the fill apply call.',
      ),
    ).toBe(true);
  });
  it.each([
    ["import { applyToPage } from './inject';", 'shell/fill/controller.ts'],
    ["import { applyToPage } from './inject';", 'shell/fill/inject.test.ts'],
    ["import type { ScanOutcome } from '../fill/inject';", 'shell/ui/x.tsx'],
    ["import type { ScanOutcome } from './inject';", 'shell/fill/other.ts'],
  ])('allows the import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
  it('still rejects shell imports in core/', async () => {
    const found = await syntaxMessages(
      "import { x } from '../../shell/fill/inject';",
      'core/src/status.ts',
    );
    expect(found.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });
  const controllerRule = '@typescript-eslint/no-restricted-imports';
  it.each([
    [
      "import { createFillController } from '../fill/controller';",
      'shell/ui/FillSection.tsx',
    ],
    [
      "import { createFillController } from '../../shell/fill/controller';",
      'entrypoints/background.ts',
    ],
    [
      "import { createFillController } from './controller.js';",
      'shell/fill/other.ts',
    ],
    ["export * from './controller';", 'shell/fill/index.ts'],
  ])('rejects the controller import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.ruleId === controllerRule)).toBe(true);
  });
  it('rejects a dynamic import of the controller', async () => {
    const found = await syntaxMessages(
      "const m = await import('../fill/controller');",
      'entrypoints/background.ts',
    );
    expect(
      found.some(
        (m) =>
          m.message ===
          'Only shell/ui/Popup.tsx may import the fill controller.',
      ),
    ).toBe(true);
  });
  it.each([
    [
      "import type { FillController } from '../fill/controller';",
      'shell/ui/FillSection.tsx',
    ],
    [
      "import { type FillState } from '../fill/controller';",
      'shell/ui/fill-view.ts',
    ],
    [
      "import { createFillController } from '../fill/controller';",
      'shell/ui/Popup.tsx',
    ],
    [
      "import { createFillController } from './controller';",
      'shell/fill/controller.test.ts',
    ],
  ])('allows the controller import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.ruleId === controllerRule)).toBe(false);
  });
  it.each([
    [
      "import { scanPage } from '../shell/fill/inject';",
      'entrypoints/background.ts',
    ],
    ["import { scanPage } from '../fill/inject';", 'shell/capture/inject.ts'],
    ["import { scanPage } from './inject';", 'shell/fill/other.ts'],
    ["import { FILL_TIMEOUT_MS } from '../fill/inject';", 'shell/ui/Popup.tsx'],
    ["import { scanPage } from './inject';", 'shell/fill/controller.test.ts'],
    ["import { scanPage } from '../inject';", 'shell/fill/page/x.ts'],
    ["import { scanPage } from '../../inject.js';", 'shell/fill/page/y/x.ts'],
    ["import { scanPage } from '../../fill/inject';", 'shell/ui/x.ts'],
    ["import { scanPage } from '../shell/fill/inject';", 'entrypoints/x.ts'],
  ])('rejects the injector import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.ruleId === controllerRule)).toBe(true);
  });
  it.each([
    ["import { scanPage } from './inject';", 'shell/fill/controller.ts'],
    ["import { scanPage } from './inject';", 'shell/fill/inject.test.ts'],
    [
      "import type { ScanOutcome } from '../fill/inject';",
      'shell/ui/Popup.tsx',
    ],
    [
      "import type { ScanOutcome } from '../fill/inject';",
      'entrypoints/background.ts',
    ],
    ["import { openTab } from './inject';", 'shell/capture/other.ts'],
    ["import type { ScanOutcome } from '../inject';", 'shell/fill/page/x.ts'],
  ])('allows the injector import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.ruleId === controllerRule)).toBe(false);
  });
  it.each([
    [
      "import { createFillController } from '../controller';",
      'shell/fill/page/x.ts',
    ],
    ["export * from '../../controller.js';", 'shell/fill/page/y/x.ts'],
    [
      "import { createFillController } from '../controller';",
      'shell/fill/inject.test.ts',
    ],
  ])('rejects the parent controller import %s in %s', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.ruleId === controllerRule)).toBe(true);
  });
  it('allows a type import of the controller from a fill subfolder', async () => {
    const found = await syntaxMessages(
      "import type { FillState } from '../controller';",
      'shell/fill/page/x.ts',
    );
    expect(found.some((m) => m.ruleId === controllerRule)).toBe(false);
  });
  it.each([
    ["const m = await import('../inject');", 'shell/fill/page/x.ts'],
    ["const m = await import('../../inject.js');", 'shell/fill/page/y/x.ts'],
    ['const m = await import(`../fill/inject`);', 'shell/ui/x.ts'],
    ['const m = await import(`../fill/controller`);', 'shell/ui/x.ts'],
    ['const m = await import(x);', 'shell/ui/x.ts'],
  ])('rejects the dynamic import %s in %s (new forms)', async (code, file) => {
    const found = await syntaxMessages(code, file);
    expect(
      found.some(
        (m) =>
          m.message ===
            'Only shell/fill/controller.ts may import the fill apply call.' ||
          m.message ===
            'Only shell/ui/Popup.tsx may import the fill controller.' ||
          m.message === 'import() must use a plain string.',
      ),
    ).toBe(true);
  });
  it('rejects a dynamic parent controller import', async () => {
    const found = await syntaxMessages(
      "const m = await import('../controller');",
      'shell/fill/page/x.ts',
    );
    expect(
      found.some(
        (m) =>
          m.message ===
          'Only shell/ui/Popup.tsx may import the fill controller.',
      ),
    ).toBe(true);
  });
  it.each([
    [
      'const m = await import(`../fill/inject`);',
      'import() must use a plain string.',
    ],
    ['const m = await import(x);', 'import() must use a plain string.'],
  ])('flags %s as a non-literal import', async (code, message) => {
    const found = await syntaxMessages(code, 'shell/ui/x.ts');
    expect(found.some((m) => m.message === message)).toBe(true);
  });
  const fillCallMessage =
    'Only the Fill button in shell/ui/FillSection.tsx may read fill() from the controller.';
  it.each([
    ['shell/ui/Popup.tsx', 'void ctrl.fill();'],
    ['shell/ui/NewButton.tsx', 'void controller.fill();'],
    ['shell/ui/Popup.tsx', "void ctrl['fill']();"],
    ['shell/ui/Popup.tsx', 'const { fill } = ctrl;'],
    ['shell/ui/Popup.tsx', 'const { fill: go } = ctrl;'],
    ['shell/ui/Popup.tsx', 'const x = <button onClick={ctrl.fill} />;'],
    ['shell/ui/Popup.tsx', 'void ctrl.fill?.();'],
    ['shell/ui/Popup.tsx', 'void ctrl[`fill`]();'],
    ['shell/ui/Popup.tsx', 'const { [`fill`]: go } = ctrl;'],
    ['entrypoints/background.ts', 'void controller.fill();'],
  ])('rejects reading fill() in %s: %s', async (file, code) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.message === fillCallMessage)).toBe(true);
  });
  it.each([
    ['shell/ui/FillSection.tsx', 'void props.controller.fill();'],
    ['shell/fill/controller.ts', 'const c = { fill };'],
    ['shell/fill/controller.test.ts', 'await controller.fill();'],
    ['core/src/fill/x.ts', 'const a = new Array(3).fill(0);'],
  ])('allows reading fill() in %s: %s', async (file, code) => {
    const found = await syntaxMessages(code, file);
    expect(found.some((m) => m.message === fillCallMessage)).toBe(false);
  });
  const fillNameMessage =
    'Only shell/fill/inject.ts and entrypoints/fill.ts may name the fill script or its hook.';
  it.each([
    "browser.scripting.executeScript({ target: t, files: ['/fill.js'] });",
    "const f = 'fill.js';",
    'const f = `/fill.js`;',
    "const n = '__countersignFill';",
    'const h = globalThis.__countersignFill;',
  ])('rejects the fill name in capture/inject.ts: %s', async (code) => {
    const found = await syntaxMessages(code, 'shell/capture/inject.ts');
    expect(found.some((m) => m.message === fillNameMessage)).toBe(true);
  });
  it.each([
    'shell/ui/x.tsx',
    'entrypoints/background.ts',
    'shell/fill/page/x.ts',
    'guard/scan.ts',
  ])('rejects the fill name in %s', async (file) => {
    const found = await syntaxMessages("const f = '/fill.js';", file);
    expect(found.some((m) => m.message === fillNameMessage)).toBe(true);
  });
  it.each(['shell/fill/inject.ts', 'entrypoints/fill.ts'])(
    'allows the fill name in %s',
    async (file) => {
      const found = await syntaxMessages(
        "const f = '/fill.js'; const h = globalThis.__countersignFill;",
        file,
      );
      expect(found.some((m) => m.message === fillNameMessage)).toBe(false);
    },
  );
  const styleMessage = 'No inline styles: the CSP blocks them. Use a class.';
  it.each(['shell/ui/x.tsx', 'entrypoints/popup/x.tsx'])(
    'rejects a style prop in %s',
    async (file) => {
      const found = await syntaxMessages(
        'const x = <p style="color:red">a</p>;',
        file,
      );
      expect(found.some((m) => m.message === styleMessage)).toBe(true);
    },
  );
  it('keeps the navigation rule in .tsx', async () => {
    const found = await syntaxMessages('location.reload();', 'shell/ui/x.tsx');
    expect(found.some((m) => m.message === navMessage)).toBe(true);
  });
  it('keeps the network rule in .tsx', async () => {
    const found = await syntaxMessages(
      "navigator.sendBeacon('https://example.com');",
      'shell/ui/x.tsx',
    );
    expect(
      found.some(
        (m) => m.message === 'This extension makes no network requests.',
      ),
    ).toBe(true);
  });
});

describe('fill page guard', { timeout: 60_000 }, () => {
  const fillMessage =
    'The fill page script only reads fields and sets their values.';
  const pageFiles = ['shell/fill/page/x.ts', 'entrypoints/fill.ts'];
  const eventsFile = 'shell/fill/page/events.ts';
  // Probe paths do not exist on disk, so switch type information off.
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

  const rejected = [
    'form.submit();',
    'form.requestSubmit();',
    'el.click();',
    "el['click']();",
    'el.focus();',
    'el.dispatchEvent(e);',
    'el.scrollIntoView();',
    "document.createEvent('Event');",
    "document.execCommand('insertText');",
    "new Event('input');",
    "new KeyboardEvent('keydown');",
    "new MouseEvent('click');",
    "new window.PointerEvent('pointerdown');",
    "new CustomEvent('x');",
    "document.createElement('div');",
    "el.setAttribute('a', 'b');",
    "el.removeAttribute('a');",
    "el.dataset.x = '1';",
    "el.innerHTML = '';",
    'el.outerHTML;',
    "el.insertAdjacentHTML('beforeend', '');",
    'el.append(x);',
    'el.appendChild(x);',
    'console.log(1);',
    "localStorage.setItem('a', 'b');",
    'window.sessionStorage;',
    "postMessage('x');",
    "window.postMessage('x', '*');",
    'document.cookie;',
    "el['dispatchEvent'](e);",
    "new window['MouseEvent']('x');",
    "el['innerHTML'] = '';",
    "document['cookie'];",
    "window['postMessage']('x');",
    "window['console'];",
    "window['localStorage'];",
    "window['sessionStorage'];",
    'el.focus.call(el);',
    'const f = el.scrollIntoView;',
    'Reflect.apply(el.focus, el, []);',
    'el.blur();',
    "el['focus']();",
    "el['blur']();",
    "el['scrollIntoView']();",
    "el['submit']();",
    "el['requestSubmit']();",
    "document['createEvent']('Event');",
    "document['execCommand']('insertText');",
    "document['createElement']('div');",
    "el['setAttribute']('a', 'b');",
    "el['removeAttribute']('a');",
    "el['toggleAttribute']('a');",
    'el.toggleAttribute(a);',
    "el['dataset'];",
    "el['outerHTML'];",
    "el['insertAdjacentHTML']('beforeend', '');",
    "el['append'](x);",
    "el['appendChild'](x);",
    'form.reset();',
    'el.remove();',
    'el.replaceChildren();',
    'el.replaceWith(x);',
    'el.prepend(x);',
    'el.before(x);',
    'el.after(x);',
    'el.insertAdjacentElement(p, x);',
    'el.insertBefore(x, y);',
    'el.removeChild(x);',
    'el.replaceChild(x, y);',
    "el.addEventListener('input', f);",
    "el.removeEventListener('input', f);",
    "el.attachShadow({ mode: 'open' });",
    "el.setAttributeNS(null, 'a', 'b');",
    "el['reset']();",
    "el.classList.add('x');",
    "el.classList.remove('x');",
    "el.classList.toggle('x');",
    "el.classList.replace('x', 'y');",
    "el['classList'].add('x');",
    "el.style.setProperty('a', 'b');",
    "el.style.removeProperty('a');",
    "el.className = 'x';",
    "el.id = 'x';",
    "el.textContent = 'x';",
    "el.textContent += 'x';",
    "el.innerText = 'x';",
    "el.outerText = 'x';",
    "el.style = 'x';",
    "el.style.cssText = 'x';",
    "el.style.color = 'red';",
    "el.style['color'] = 'red';",
    "el['textContent'] = 'x';",
    "el.classList.value = 'x';",
    "el.insertAdjacentText('beforeend', 'x');",
    "el.setHTMLUnsafe('x');",
    "document.write('x');",
    "document.writeln('x');",
    'el.normalize();',
    'el.hidden = true;',
    "el.title = 'x';",
    'el.disabled = true;',
    "el.slot = 'x';",
    "node.nodeValue = 'x';",
    "node.data = 'x';",
    "el.lang = 'x';",
    "Object.assign(el, { value: 'x' });",
    "Object['assign'](el.style, {});",
  ];
  describe.each(pageFiles)('in %s', (file) => {
    it.each(rejected)('rejects %s in the page script', async (code) => {
      const found = await syntaxMessages(code, file);
      expect(found.some((m) => m.message === fillMessage)).toBe(true);
    });
    it.each([
      "el.value = 'x';",
      'const v = el.checked;',
      "setter.call(el, 'x');",
      "el.querySelectorAll('input');",
      'const submitted = 1;',
      'const t = el.textContent;',
      "const t = (el.textContent ?? '').trim();",
      'const d = view.getComputedStyle(el).display;',
      'const s = el.style;',
      'const c = el.className;',
      'const i = el.id;',
      "const h = el.classList.contains('x');",
      'seen.add(key);',
      'const t = el.title;',
      'const d = el.disabled;',
    ])('allows %s', async (code) => {
      const found = await syntaxMessages(code, file);
      expect(found.some((m) => m.message === fillMessage)).toBe(false);
    });
  });

  it('events.ts may dispatch a plain Event', async () => {
    const found = await syntaxMessages(
      "el.dispatchEvent(new Event('input', { bubbles: true }));",
      eventsFile,
    );
    expect(found.some((m) => m.message === fillMessage)).toBe(false);
  });
  it.each([
    "el.dispatchEvent(new Event('change', { bubbles: true }));",
    "new Event('input');",
    "el['dispatchEvent'](new Event('input'));",
    "el.dispatchEvent(new window.Event('change'));",
  ])('events.ts allows %s', async (code) => {
    const found = await syntaxMessages(code, eventsFile);
    expect(found.some((m) => m.message === fillMessage)).toBe(false);
  });
  it.each([
    "new window['InputEvent']('x');",
    "new Event('focus');",
    'new Event(type);',
    'new Event();',
    "new window.Event('focus');",
    "new window['Event']('focus');",
    'el.focus();',
    'el.blur();',
    "document['createEvent']('Event');",
  ])('events.ts also rejects %s', async (code) => {
    const found = await syntaxMessages(code, eventsFile);
    expect(found.some((m) => m.message === fillMessage)).toBe(true);
  });
  it.each([
    "new KeyboardEvent('keydown');",
    "new InputEvent('input');",
    "new window.InputEvent('input');",
    'el.click();',
    'form.submit();',
    'console.log(1);',
  ])('events.ts may do nothing else: rejects %s', async (code) => {
    const found = await syntaxMessages(code, eventsFile);
    expect(found.some((m) => m.message === fillMessage)).toBe(true);
  });
  it.each([...pageFiles, eventsFile])(
    'keeps the shared rules in %s',
    async (file) => {
      for (const [code, message] of [
        [
          "navigator.sendBeacon('https://example.com');",
          'This extension makes no network requests.',
        ],
        [
          'location.reload();',
          'Countersign never navigates away or opens windows.',
        ],
        [
          'browser.tabs.query({});',
          'Use tabs only in open-dashboard.ts, capture/inject.ts or fill/inject.ts.',
        ],
        [
          'browser.scripting.executeScript({});',
          'Inject only through shell/capture/inject.ts or shell/fill/inject.ts.',
        ],
        [
          "browser.downloads.download({ url: 'blob:x' });",
          'Save files only through shell/files/download.ts.',
        ],
      ] as const) {
        const found = await syntaxMessages(code, file);
        expect(found.some((m) => m.message === message)).toBe(true);
      }
    },
  );
  it('does not reach other files', async () => {
    const found = await syntaxMessages('el.click();', 'shell/ui/x.tsx');
    expect(found.some((m) => m.message === fillMessage)).toBe(false);
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
