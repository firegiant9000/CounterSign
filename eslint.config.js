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
  "MemberExpression[object.property.name='downloads'][property.name='download']",
  "MemberExpression[object.name='downloads'][property.name='download']",
  "MemberExpression[object.property.name='downloads'][property.value='download']",
  "MemberExpression[object.name='downloads'][property.value='download']",
].map((selector) => ({ selector, message: DOWNLOAD_MESSAGE }));

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
      'no-restricted-syntax': ['error', ...networkSyntax, ...downloadSyntax],
    },
  },
  // The one place allowed to call downloads.download. This block replaces the
  // shared rule for the file, so it re-spreads the network selectors.
  {
    files: ['shell/files/download.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...networkSyntax],
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
