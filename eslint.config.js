import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// The extension makes no network requests. These entries apply to all
// project source, and core/ spreads them into its own rule options because a
// later block that sets the same rule replaces the earlier one.
const NETWORK_MESSAGE = 'This extension makes no network requests.';
const networkGlobals = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'Worker',
  'SharedWorker',
  'importScripts',
  'Request',
].map((name) => ({ name, message: NETWORK_MESSAGE }));
const networkProperties = ['window', 'globalThis', 'self'].map((object) => ({
  object,
  property: 'fetch',
  message: NETWORK_MESSAGE,
}));
const networkSyntax = [
  {
    selector: "MemberExpression[property.name='sendBeacon']",
    message: NETWORK_MESSAGE,
  },
  {
    selector: "MemberExpression[property.value='sendBeacon']",
    message: NETWORK_MESSAGE,
  },
];
// Saving a file is the one way data leaves the extension, so every save goes
// through shell/files/download.ts, which builds a local blob: URL.
const DOWNLOAD_MESSAGE = 'Save files only through shell/files/download.ts.';
const downloadSyntax = [
  "MemberExpression[property.name='downloads']",
  "MemberExpression[property.value='downloads']",
  "Property[key.name='downloads']",
].map((selector) => ({ selector, message: DOWNLOAD_MESSAGE }));
// Nothing navigates the page away or opens a window. Assigning location.hash
// stays legal (the UI uses it for routing); indexedDB.open and window.close
// are not matched because only a bare open() call is banned.
const NAVIGATION_MESSAGE = 'Countersign never navigates away or opens windows.';
// Only these objects count as the page, so assigning a data field that happens
// to be named location (job.location = ...) stays legal.
const GLOBAL_OBJECTS = '/^(window|document|globalThis|self|top|parent)$/';
const navigationSyntax = [
  "MemberExpression[object.name='window'][property.name='open']",
  "MemberExpression[object.name='window'][property.value='open']",
  "MemberExpression[object.name=/^(globalThis|self)$/][property.name='open']",
  "MemberExpression[object.name=/^(globalThis|self)$/][property.value='open']",
  "CallExpression[callee.type='Identifier'][callee.name='open']",
  "CallExpression[callee.property.name=/^(assign|replace|reload)$/][callee.object.name='location']",
  "CallExpression[callee.property.value=/^(assign|replace|reload)$/][callee.object.name='location']",
  `CallExpression[callee.property.name=/^(assign|replace|reload)$/][callee.object.property.name='location'][callee.object.object.name=${GLOBAL_OBJECTS}]`,
  `CallExpression[callee.property.value=/^(assign|replace|reload)$/][callee.object.property.name='location'][callee.object.object.name=${GLOBAL_OBJECTS}]`,
  "AssignmentExpression[left.type='Identifier'][left.name='location']",
  `AssignmentExpression[left.property.name='location'][left.object.name=${GLOBAL_OBJECTS}]`,
  `AssignmentExpression[left.property.value='location'][left.object.name=${GLOBAL_OBJECTS}]`,
  "AssignmentExpression[left.property.name='href'][left.object.name='location']",
  "AssignmentExpression[left.property.value='href'][left.object.name='location']",
  `AssignmentExpression[left.property.name='href'][left.object.property.name='location'][left.object.object.name=${GLOBAL_OBJECTS}]`,
  `AssignmentExpression[left.property.value='href'][left.object.property.name='location'][left.object.object.name=${GLOBAL_OBJECTS}]`,
].map((selector) => ({ selector, message: NAVIGATION_MESSAGE }));
// Reading tabs and injecting scripts are confined to three shell files.
const TABS_MESSAGE =
  'Use tabs only in open-dashboard.ts, capture/inject.ts or fill/inject.ts.';
const tabsSyntax = [
  "MemberExpression[property.name='tabs']",
  "MemberExpression[property.value='tabs']",
  "Property[key.name='tabs']",
].map((selector) => ({ selector, message: TABS_MESSAGE }));
const SCRIPTING_MESSAGE =
  'Inject only through shell/capture/inject.ts or shell/fill/inject.ts.';
const scriptingSyntax = [
  "MemberExpression[property.name='scripting']",
  "MemberExpression[property.value='scripting']",
  "Property[key.name='scripting']",
].map((selector) => ({ selector, message: SCRIPTING_MESSAGE }));
// The extension CSP (wxt.config.ts) sets default-src 'self' and no style-src,
// so a style= prop is refused at runtime with no build error. Use a class.
const STYLE_MESSAGE = 'No inline styles: the CSP blocks them. Use a class.';
const styleSyntax = [
  { selector: "JSXAttribute[name.name='style']", message: STYLE_MESSAGE },
];
// The fill page script runs inside the user's page. It reads fields and sets
// their values, nothing else. Each part below is a named list so that
// shell/fill/page/events.ts can drop exactly the dispatch and constructor
// selectors it needs to change.
const FILL_PAGE_MESSAGE =
  'The fill page script only reads fields and sets their values.';
/** @param {string[]} names */
const callNames = (names) => `/^(${names.join('|')})$/`;
/** @param {string[]} names */
const callSelectors = (names) => [
  `CallExpression[callee.property.name=${callNames(names)}]`,
  `CallExpression[callee.property.value=${callNames(names)}]`,
];
/** @param {string[]} names */
const memberSelectors = (names) => [
  `MemberExpression[property.name=${callNames(names)}]`,
  `MemberExpression[property.value=${callNames(names)}]`,
];
/** @param {string[]} selectors */
const asFillSyntax = (selectors) =>
  selectors.map((selector) => ({ selector, message: FILL_PAGE_MESSAGE }));
const fillCallSyntax = asFillSyntax(
  callSelectors([
    'submit',
    'requestSubmit',
    'click',
    'focus',
    'scrollIntoView',
    'createEvent',
    'execCommand',
  ]),
);
const fillDispatchSyntax = asFillSyntax(callSelectors(['dispatchEvent']));
/** @param {string} pattern */
const eventCtorSelectors = (pattern) => [
  `NewExpression[callee.name=${pattern}]`,
  `NewExpression[callee.property.name=${pattern}]`,
  `NewExpression[callee.property.value=${pattern}]`,
];
const fillEventCtorSyntax = asFillSyntax(eventCtorSelectors('/Event$/'));
// Same as above but a bare Event is allowed: the name must have a prefix.
const fillPlainEventCtorSyntax = asFillSyntax(eventCtorSelectors('/.+Event$/'));
const fillDomSyntax = asFillSyntax(
  memberSelectors([
    'createElement',
    'setAttribute',
    'removeAttribute',
    'toggleAttribute',
    'dataset',
    'innerHTML',
    'outerHTML',
    'insertAdjacentHTML',
    'append',
    'appendChild',
  ]),
);
const fillLeakSyntax = asFillSyntax([
  `Identifier[name=${callNames(['console', 'localStorage', 'sessionStorage', 'postMessage'])}]`,
  ...memberSelectors([
    'console',
    'localStorage',
    'sessionStorage',
    'postMessage',
    'cookie',
  ]),
]);

export default defineConfig(
  {
    ignores: ['.output', '.wxt', 'node_modules', '.superpowers/'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Only eslint.config.js lies outside every tsconfig project.
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
      },
    },
    rules: {
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-properties': ['error', ...networkProperties],
      // The apply call writes into the user's page, so only the controller
      // (and the injector's own test) may import it.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)fill/inject$|^\\./inject$',
              importNames: ['applyToPage', 'browserFillApi'],
              message:
                'Only shell/fill/controller.ts may import the fill apply call.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
      ],
    },
  },
  // UI components also refuse inline styles. This block re-spreads every
  // selector the shared rule applies, so the other guards still bite here.
  {
    files: ['shell/**/*.tsx', 'entrypoints/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...styleSyntax,
      ],
    },
  },
  // Each block below replaces the shared rule for its files, so it re-spreads
  // every selector the file is still subject to.
  // The one place allowed to call downloads.download.
  {
    files: ['shell/files/download.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...navigationSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
      ],
    },
  },
  // open-dashboard.ts may use tabs, but not scripting.
  {
    files: ['shell/open-dashboard.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...scriptingSyntax,
      ],
    },
  },
  // The two injectors may use both tabs and scripting.
  {
    files: ['shell/capture/inject.ts', 'shell/fill/inject.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
      ],
    },
  },
  // The controller and the injector's test may import the apply call.
  {
    files: ['shell/fill/controller.ts', 'shell/fill/inject.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  // The fill page script may only read fields and set their values.
  {
    files: ['shell/fill/page/**', 'entrypoints/fill.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillCallSyntax,
        ...fillDispatchSyntax,
        ...fillEventCtorSyntax,
        ...fillDomSyntax,
        ...fillLeakSyntax,
      ],
    },
  },
  // events.ts alone may dispatch an event, and only a plain Event.
  {
    files: ['shell/fill/page/events.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillCallSyntax,
        ...fillPlainEventCtorSyntax,
        ...fillDomSyntax,
        ...fillLeakSyntax,
      ],
    },
  },
  // core/ is framework-free: no framework, storage or browser access.
  {
    files: ['core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'wxt', message: 'core/ must not import wxt.' },
            { name: 'preact', message: 'core/ must not import preact.' },
            { name: 'idb', message: 'core/ must not import idb.' },
          ],
          patterns: [
            { group: ['wxt/*'], message: 'core/ must not import wxt.' },
            { group: ['preact/*'], message: 'core/ must not import preact.' },
            {
              group: ['**/shell/**', '**/entrypoints/**'],
              message: 'core/ must not import from shell/ or entrypoints/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...networkGlobals,
        ...[
          'browser',
          'chrome',
          'window',
          'document',
          'navigator',
          'indexedDB',
          'localStorage',
        ].map((name) => ({
          name,
          message: 'core/ must not touch the DOM or browser APIs.',
        })),
      ],
    },
  },
);
