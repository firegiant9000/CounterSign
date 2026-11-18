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
// Reading tabs and injecting scripts are confined to two shell files.
const TABS_MESSAGE = 'Use tabs only in open-dashboard.ts or capture/inject.ts.';
const tabsSyntax = [
  "MemberExpression[property.name='tabs']",
  "MemberExpression[property.value='tabs']",
  "Property[key.name='tabs']",
].map((selector) => ({ selector, message: TABS_MESSAGE }));
const SCRIPTING_MESSAGE = 'Inject only through shell/capture/inject.ts.';
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
  // capture/inject.ts may use both tabs and scripting.
  {
    files: ['shell/capture/inject.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
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
