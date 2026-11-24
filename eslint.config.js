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
// Notifications and the permission prompt are confined to shell/notify.ts.
// Member access and destructuring are banned. Plain object-literal `permissions:`
// keys stay allowed: that is the manifest key and the argument shape of permissions.request.
const NOTIFICATIONS_MESSAGE =
  'Use notifications and permissions only in shell/notify.ts.';
const notificationsSyntax = [
  "MemberExpression[property.name='notifications']",
  "MemberExpression[property.value='notifications']",
  "MemberExpression[property.name='permissions']",
  "MemberExpression[property.value='permissions']",
  "ObjectPattern > Property[key.name='notifications']",
  "ObjectPattern > Property[key.name='permissions']",
].map((selector) => ({ selector, message: NOTIFICATIONS_MESSAGE }));
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
// no-restricted-imports cannot see import(), so a dynamic import of the fill
// apply call is caught here. It applies to every file, controller.ts included.
const applyImportSyntax = [
  {
    selector:
      'ImportExpression[source.value=/(^|\\/)fill\\/inject(\\.[jt]s)?$|^(\\.\\.?\\/)+inject(\\.[jt]s)?$/]',
    message: 'Only shell/fill/controller.ts may import the fill apply call.',
  },
  {
    selector:
      'ImportExpression[source.value=/(^|\\/)fill\\/controller(\\.[jt]s)?$|^(\\.\\.?\\/)+controller(\\.[jt]s)?$/]',
    message: 'Only shell/ui/Popup.tsx may import the fill controller.',
  },
  // A template literal or variable has no source.value to match, so refuse it.
  {
    selector: "ImportExpression[source.type!='Literal']",
    message: 'import() must use a plain string.',
  },
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
  callSelectors(['createEvent', 'execCommand']),
);
// Plain member access is banned, not just calls, so el.focus.call(el),
// Reflect.apply(el.focus, ...) and const f = el.scrollIntoView are caught too.
const fillActionSyntax = asFillSyntax(
  memberSelectors([
    'submit',
    'requestSubmit',
    'click',
    'focus',
    'blur',
    'scrollIntoView',
  ]),
);
const fillDispatchSyntax = asFillSyntax(memberSelectors(['dispatchEvent']));
/** @param {string} pattern */
const eventCtorSelectors = (pattern) => [
  `NewExpression[callee.name=${pattern}]`,
  `NewExpression[callee.property.name=${pattern}]`,
  `NewExpression[callee.property.value=${pattern}]`,
];
const fillEventCtorSyntax = asFillSyntax(eventCtorSelectors('/Event$/'));
// events.ts: every name longer than Event stays banned, and a plain Event is
// banned unless its first argument is the literal 'input' or 'change'.
const notInputOrChange =
  ":not([arguments.0.type='Literal'][arguments.0.value=/^(input|change)$/])";
const fillPlainEventCtorSyntax = asFillSyntax([
  ...eventCtorSelectors('/.+Event$/'),
  `NewExpression[callee.name='Event']${notInputOrChange}`,
  `NewExpression[callee.property.name='Event']${notInputOrChange}`,
  `NewExpression[callee.property.value='Event']${notInputOrChange}`,
]);
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
    'setAttributeNS',
    'removeAttributeNS',
    'setAttributeNode',
    'removeAttributeNode',
    'insertAdjacentElement',
    'insertBefore',
    'removeChild',
    'replaceChild',
    'replaceChildren',
    'replaceWith',
    'prepend',
    'before',
    'after',
    'remove',
    'reset',
    'addEventListener',
    'removeEventListener',
    'attachShadow',
    'insertAdjacentText',
    'setHTMLUnsafe',
    'write',
    'writeln',
    'normalize',
  ]),
);
// classList and style are readable, but changing them is not.
/**
 * @param {string} object
 * @param {string[]} names
 */
const objectCallSelectors = (object, names) => [
  `CallExpression[callee.object.property.name='${object}'][callee.property.name=${callNames(names)}]`,
  `CallExpression[callee.object.property.value='${object}'][callee.property.name=${callNames(names)}]`,
  `CallExpression[callee.object.property.name='${object}'][callee.property.value=${callNames(names)}]`,
  `CallExpression[callee.object.property.value='${object}'][callee.property.value=${callNames(names)}]`,
];
const ASSIGNED = [
  'className',
  'id',
  'textContent',
  'innerText',
  'outerText',
  'style',
  'cssText',
  'classList',
  'hidden',
  'title',
  'disabled',
  'slot',
  'nodeValue',
  'data',
  'lang',
];
// `.add` and `.toggle` are banned on classList only: scan.ts and label.ts call
// Set.add.
const fillMutationSyntax = asFillSyntax([
  "CallExpression[callee.object.name='Object'][callee.property.name='assign']",
  "CallExpression[callee.object.name='Object'][callee.property.value='assign']",
  ...objectCallSelectors('classList', ['add', 'remove', 'toggle', 'replace']),
  ...objectCallSelectors('style', ['setProperty', 'removeProperty']),
  `AssignmentExpression[left.type='MemberExpression'][left.property.name=${callNames(ASSIGNED)}]`,
  `AssignmentExpression[left.type='MemberExpression'][left.property.value=${callNames(ASSIGNED)}]`,
  'AssignmentExpression[left.object.property.name=/^(style|classList)$/]',
  'AssignmentExpression[left.object.property.value=/^(style|classList)$/]',
]);
// Only the injector and the page script's entry point may name the fill script
// or its hook, so no other file can inject or call it.
const FILL_NAME_MESSAGE =
  'Only shell/fill/inject.ts and entrypoints/fill.ts may name the fill script or its hook.';
const FILL_NAME = '/fill\\.js|__countersignFill/';
const fillNameSyntax = [
  `Literal[value=${FILL_NAME}]`,
  `TemplateElement[value.cooked=${FILL_NAME}]`,
  "Identifier[name='__countersignFill']",
].map((selector) => ({ selector, message: FILL_NAME_MESSAGE }));
// fill() writes into the page, so only the Fill button's click handler in
// FillSection.tsx may reach it. The selectors ban reading `.fill` in any form
// (call, reference, computed key, optional call) and destructuring it.
const FILL_CALL_MESSAGE =
  'Only the Fill button in shell/ui/FillSection.tsx may read fill() from the controller.';
const fillCallerSyntax = [
  "MemberExpression[property.name='fill']",
  "MemberExpression[property.value='fill']",
  "ObjectPattern > Property[key.name='fill']",
  "ObjectPattern > Property[key.value='fill']",
  // A template key with no substitutions: ctrl[`fill`] and { [`fill`]: f }.
  "MemberExpression[property.type='TemplateLiteral'][property.quasis.0.value.cooked='fill']",
  "ObjectPattern > Property[key.type='TemplateLiteral'][key.quasis.0.value.cooked='fill']",
].map((selector) => ({ selector, message: FILL_CALL_MESSAGE }));
// Module-wide import bans. The apply call is the controller's alone, and the
// controller is Popup.tsx's alone. Type imports stay free.
const injectImport = {
  regex: '(^|/)fill/inject(\\.[jt]s)?$',
  allowTypeImports: true,
  message: 'Only shell/fill/controller.ts may import shell/fill/inject.ts.',
};
const siblingInjectImport = {
  ...injectImport,
  regex: '^(\\.\\.?/)+inject(\\.[jt]s)?$',
};
const controllerImport = {
  regex: '(^|/)fill/controller(\\.[jt]s)?$|^\\./controller(\\.[jt]s)?$',
  allowTypeImports: true,
  message: 'Only shell/ui/Popup.tsx may import the fill controller.',
};
const siblingControllerImport = {
  ...controllerImport,
  regex: '^(\\.\\.?/)+controller(\\.[jt]s)?$',
};
/** @param {object[]} patterns */
const restrictImports = (...patterns) => ['error', { patterns }];
const fillLeakSyntax = asFillSyntax([
  `Identifier[name=${callNames(['console', 'localStorage', 'sessionStorage', 'postMessage'])}]`,
  // The Identifier selector already catches these by name, so a computed
  // string is the only member form left to add.
  `MemberExpression[property.value=${callNames(['console', 'localStorage', 'sessionStorage', 'postMessage'])}]`,
  ...memberSelectors(['cookie']),
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
              regex: '(^|/)fill/inject(\\.[jt]s)?$|^\\./inject(\\.[jt]s)?$',
              importNames: ['applyToPage', 'browserFillApi'],
              message:
                'Only shell/fill/controller.ts may import the fill apply call.',
            },
          ],
        },
      ],
      // Value imports of the fill controller are Popup.tsx's alone; its
      // default injector writes to the page. Type imports stay free.
      '@typescript-eslint/no-restricted-imports': restrictImports(
        controllerImport,
        injectImport,
      ),
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
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
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
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
        ...notificationsSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
      ],
    },
  },
  // open-dashboard.ts (and its test, which mocks browser.tabs) may use tabs, but not scripting.
  {
    files: ['shell/open-dashboard.ts', 'shell/open-dashboard.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
      ],
    },
  },
  // notify.ts alone may use notifications and permissions.
  {
    files: ['shell/notify.ts', 'shell/notify.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
      ],
    },
  },
  // The two injectors may use both tabs and scripting. Only the fill injector
  // may name the fill script and its hook.
  {
    files: ['shell/capture/inject.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...fillNameSyntax,
      ],
    },
  },
  {
    files: ['shell/fill/inject.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
      ],
    },
  },
  // Inside shell/fill/, a sibling './inject' is the fill injector too.
  {
    files: ['shell/fill/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictImports(
        controllerImport,
        injectImport,
        siblingInjectImport,
        siblingControllerImport,
      ),
    },
  },
  // The controller and the injector's test may import the injector.
  {
    files: ['shell/fill/controller.ts', 'shell/fill/inject.test.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': restrictImports(
        controllerImport,
        siblingControllerImport,
      ),
    },
  },
  // Popup.tsx and the controller's own test may import the controller.
  {
    files: ['shell/ui/Popup.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictImports(injectImport),
    },
  },
  {
    files: ['shell/fill/controller.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictImports(
        injectImport,
        siblingInjectImport,
      ),
    },
  },
  // The fill page script may only read fields and set their values.
  {
    files: ['shell/fill/page/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
        ...fillCallSyntax,
        ...fillActionSyntax,
        ...fillDispatchSyntax,
        ...fillEventCtorSyntax,
        ...fillDomSyntax,
        ...fillMutationSyntax,
        ...fillLeakSyntax,
      ],
    },
  },
  // entrypoints/fill.ts is the page script's entry point, so it names the hook.
  {
    files: ['entrypoints/fill.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillCallSyntax,
        ...fillActionSyntax,
        ...fillDispatchSyntax,
        ...fillEventCtorSyntax,
        ...fillDomSyntax,
        ...fillMutationSyntax,
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
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...fillCallerSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillCallSyntax,
        ...fillActionSyntax,
        ...fillNameSyntax,
        ...fillPlainEventCtorSyntax,
        ...fillDomSyntax,
        ...fillMutationSyntax,
        ...fillLeakSyntax,
      ],
    },
  },
  // The guard tests and this file name the fill script to test and ban it.
  {
    files: ['guard/**', 'eslint.config.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
      ],
    },
  },
  // guard/scan.ts is not a test, so it may not name the fill script either.
  {
    files: ['guard/scan.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
      ],
    },
  },
  // fill() is read only by FillSection.tsx. The controller defines it and its
  // test calls it. These blocks keep every other selector for those files.
  {
    files: ['shell/fill/controller.ts', 'shell/fill/controller.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
      ],
    },
  },
  {
    files: ['shell/ui/FillSection.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
        ...styleSyntax,
      ],
    },
  },
  // core/ is framework-free: no framework, storage or browser access.
  {
    files: ['core/**'],
    rules: {
      // core/ cannot reach the controller, and Array.fill is legitimate here.
      'no-restricted-syntax': [
        'error',
        ...networkSyntax,
        ...notificationsSyntax,
        ...downloadSyntax,
        ...navigationSyntax,
        ...applyImportSyntax,
        ...tabsSyntax,
        ...scriptingSyntax,
        ...fillNameSyntax,
      ],
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
