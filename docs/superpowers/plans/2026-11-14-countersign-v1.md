# Countersign Version 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Countersign version 1, a local-only Firefox (Manifest V3) extension that tracks a job search, in three stages that are each usable on real applications.

**Architecture:** One extension. `core/` is framework-free TypeScript (types, schema, migrations, a three-method repository interface, and pure functions for every rule) that cannot see the DOM or `browser.*`. A thin shell supplies IndexedDB storage, file export, and a Preact dashboard page; the popup and capture script arrive in stage 2. The UI loads one snapshot of all records, renders it through `core/` functions, and writes by sending a batch of operations to the repository.

**Tech Stack:** WXT 0.21.5, Vite 8.3.8, TypeScript 6.0.3, Preact 11.2.0, `idb` 8.0.4, Vitest 5.1.0, `fake-indexeddb` 6.2.8, ESLint 10.15.0 with `typescript-eslint` 8.72.2, Prettier 3.10.1, `web-ext` 10.8.0, npm with a committed lockfile, Node 22.20.0.

**Spec:** `docs/superpowers/specs/2026-11-13-countersign-design.md` (approved 2026-11-14). Executors read the spec and this plan.

## Global Constraints

- The extension makes no network requests. Never use `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon`, and never load a remote script, style, font or image.
- Nothing runs on a web page until the user clicks the toolbar button or presses the hotkey. No `content_scripts` and no host permissions in the manifest, ever.
- Permissions ceiling: `activeTab`, `scripting`, `storage`, `downloads`, `alarms`, `unlimitedStorage`. A permission is added by the task that first needs it.
- `core/` imports nothing from `browser.*`, the DOM, `wxt`, `preact`, `idb`, `shell/` or `entrypoints/`.
- The background context is an event page and holds no state in memory.
- Only `id` and `createdAt` are required on any record. Every function that reads records must tolerate missing fields, dangling links and unknown status keys without throwing.
- Migrations are forward-only and each has a test.
- No AI features and no AI dependencies. No code, configuration or keys copied from other extensions.
- Public repository: synthetic fixtures only, with invented company names and `example.com` URLs. No real postings, contacts, answers, personal details or secrets in code, docs, commit messages or pull request text.
- Fixture file names must not contain `backup` or start with `countersign-export-`; `.gitignore` ignores both patterns.
- Never `git add` anything under `docs/superpowers/prompts/`.
- Dependencies are installed with `--save-exact`. Node `22.20.0` (`.nvmrc`), 2-space indentation.
- Extension ID: `countersign@firegiant9000`. `strict_min_version`: `140.0`.
- Work happens on branches with pull requests. Nothing is committed to `main`. Commits and pull requests carry no AI attribution.
- The gate is `npm run gate`: lint, typecheck, unit tests, build, privacy guard, `web-ext lint`. A task is done when the gate passes.

## Review Focus

Failure modes the spec implies that are most likely to hurt a person using the tool. Each has a test in the task that owns the code.

1. **Restoring a bad file.** A truncated, hand-edited, non-Countersign or newer-version file must leave current data untouched and say why. Tests in Task 11 (`parseExport` rejections) and Task 13 (`replaceAll` never called).
2. **The safety copy fails during restore.** If the pre-restore export is cancelled or interrupted, restore must stop before it replaces anything. Test in Task 13.
3. **Backdated and same-day status events.** Entering old applications out of order, or two events on one day, must still give the right current status; a mis-clicked status must be undoable. Tests in Task 6.
4. **The same company typed two ways.** `Example Robotics` and ` example  robotics ` must resolve to one company record. Test in Task 7.
5. **Incomplete or odd records.** An application with no company, a status event whose application is gone, or a status key the build does not know must not break the list. Tests in Task 8.

## Upstream findings (checked 2026-11-14)

| Question | Finding | Source | Confidence |
|---|---|---|---|
| WXT version and Firefox MV3 flag | `wxt` 0.21.5. Firefox still defaults to MV2; build with `wxt build -b firefox --mv3`. Output goes to `.output/firefox-mv3`. | wxt.dev: `api/cli/wxt-build`, `guide/essentials/target-different-browsers` | Flag verified; output folder name inferred from the documented pattern |
| WXT 0.21 setup changes | `vite` is now a required peer dependency. `web-ext` and `typescript` are optional peers; `wxt dev` opens a browser only if `web-ext` is installed. The `wxt/testing` barrel is gone (use `wxt/testing/vitest-plugin`). The generated tsconfig turns on `verbatimModuleSyntax` and `noUncheckedIndexedAccess`. | wxt.dev: `guide/resources/upgrading` | Verified |
| WXT dev mode on Firefox MV3 | Supported from Firefox 147. Dev mode adds `tabs` and `scripting` permissions and a websocket to the dev server; production builds add nothing that was not declared. | WXT changelog 0.20.18; wxt.dev: `guide/essentials/config/manifest`, `guide/resources/how-wxt-works` | Verified |
| WXT background output for Firefox MV3 | Docs do not say whether it emits `background.scripts`. | wxt.dev: `guide/essentials/entrypoints` | Unverified: the build guard in Task 2 asserts it |
| Preact with WXT | No official module. Any Vite plugin works through the `vite` option. | wxt.dev: `guide/essentials/frontend-frameworks` | Verified; `@preact/preset-vite` is this plan's choice |
| Node 22.20.0 support | `wxt` needs `>=22`; `vite` 8.3.8 needs `^20.19.0 \|\| >=22.12.0`; `vitest` 5.1.0 needs `^22.12.0`; `web-ext` 10.8.0 needs `>=20`; `eslint` 10.15.0 needs `^22.13.0`. All pass. | npm registry `engines` fields | Verified |
| TypeScript version | TypeScript 7.0.2 is the latest, but `typescript-eslint` 8.72.2 accepts only `<6.1.0`. Pin 6.0.3. | npm registry `peerDependencies` | Verified |
| DOM library for capture tests (stage 2) | `jsdom` 31.0.1 needs Node `^22.22.2` and rejects 22.20.0. Use `happy-dom` 21.0.4 (`>=20`). | npm registry `engines` | Verified |
| `unlimitedStorage` | "In Firefox, enables extensions to create a 'persistent' IndexedDB database without the browser prompting the user." Best-effort origins can be evicted least-recently-used; persistent ones are skipped. The docs never say which an extension origin is by default. | MDN: `manifest.json/permissions`, `Storage_API/Storage_quotas_and_eviction_criteria` | Verified as far as the docs go. Owner decision: add the permission; Task 20 checks `navigator.storage.persisted()` |
| `data_collection_permissions` | Syntax `{ "required": ["none"] }` under `browser_specific_settings.gecko`. Supported from Firefox 140 on desktop and 142 on Android. Required for new extensions submitted to addons.mozilla.org since 3 November 2025. `web-ext lint` warns when it is missing. | MDN: `manifest.json/browser_specific_settings`; Extension Workshop: `firefox-builtin-data-consent`; `addons-linter` rules | Verified. Whether "required" covers unlisted signing is not stated; this plan declares it regardless |
| `gecko.id` | Mandatory for signing MV3. Email-like format recommended. | MDN: `manifest.json/browser_specific_settings` | Verified |
| `_execute_action` | The MV3 name (MV2 used `_execute_browser_action`). "Works like a click on a toolbar button"; `commands.onCommand` does not fire for it. Shortcut conflicts with the browser or another add-on fail silently. | MDN: `manifest.json/commands` | Verified. That it opens the popup follows from "works like a click" |
| `activeTab` through the hotkey | MDN lists keyboard shortcuts as granting `activeTab` but words it around `commands.onCommand`, which `_execute_action` does not fire. | MDN: `manifest.json/permissions/activeTab_permission` | Unverified for `_execute_action`: manual check in stage 2, task S2-5 |
| Extension-page CSP | MV3 default is `script-src 'self'; upgrade-insecure-requests;`. A custom policy replaces it and must keep `script-src 'self'`. Non-script directives are unrestricted. | MDN: `manifest.json/content_security_policy`, `Content_Security_Policy` | Verified |
| Event page | Firefox MV3 has no service worker support; `background.scripts` gives a non-persistent event page with DOM APIs. "Do not rely on global variables." | MDN: `manifest.json/background`, `Background_scripts` | Verified |
| Alarms | "Alarms do not persist across browser sessions." | MDN: `API/alarms` | Verified. This changes the backup design: see S2-6 |
| `downloads.download` | Blob URLs work and must be revoked only after the download completes (`downloads.onChanged`). `filename` may include a subfolder of the downloads folder. | MDN: `API/downloads/download` | Verified. Not covered by the docs read: `conflictAction: "overwrite"` in Firefox, and whether `saveAs: false` beats the "always ask where to save" preference. Manual checks in S2-6 |
| `web-ext sign` for unlisted | Needs `--channel unlisted` and credentials in `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`. | Extension Workshop: `web-ext-command-reference` | Read from a summarised page. Whether unlisted builds need a source upload was not found; confirm at the first signing (Task 20) |
| GitHub Actions pins | `actions/checkout` v7.0.1 is `3d3c42e5aac5ba805825da76410c181273ba90b1`; `actions/setup-node` v7.1.0 is `949feb2413d6458794dcd2491c4babbbce0c15c1`. | GitHub API | Verified |

## Decisions made in this plan

The spec leaves these to the builder, or they follow from the findings above. They are listed so the owner can strike any of them at review.

1. **`core/` is a folder with its own `tsconfig.json`, not an npm workspace.** Its tsconfig has no DOM library, so touching the DOM fails the typecheck; a lint rule bans the imports. Same guarantee as a package, less tooling.
2. **The repository interface has three methods:** `snapshot()`, `apply(ops)`, `replaceAll(data)`. The data set is hundreds of records, so views filter in memory and there are no secondary indexes.
3. **Stores are created per stage** (schema 1 in stage 1, schema 2 in stage 2, schema 3 in stage 3), so every stage ships a real migration with a test before a risky one is ever needed.
4. **An application carries its own editable `title` and `url`.** The Job record stays an immutable capture and arrives in stage 2.
5. **Archived is derived:** an application is archived when its current status is Accepted, Rejected, No response or Withdrawn. There is no archive flag.
6. **A status event has `occurredOn`** (so old applications can be entered with their real dates) **and `voidedAt`** (so a mis-click can be undone without deleting history).
7. **The CSP is stricter than the spec:** `default-src 'self'` is added, because `connect-src 'none'` alone does not stop a remote image, font or stylesheet.
8. **Restore validation is structural** (envelope, version, arrays, `id`, `createdAt`). Dangling links are tolerated so a person can always restore their own file.
9. **The export file includes settings** (status labels now, the cut-off later), so a restore brings them back.
10. **The weekly backup is a due-check, not a seven-day alarm,** because alarms do not survive a browser restart (stage 2).
11. **WXT auto-imports are off** (`imports: false`), so every import is visible to a reader and to the privacy lint rule.
12. **The gate is defined in `CONTRIBUTING.md`;** a short `CLAUDE.md` points to it.
13. **Not included:** Dependabot (pull request noise against the 12-hour cap) and component tests (the spec says no browser automation; UI logic lives in `core/` where it is tested).
14. **Owner additions (2026-11-14):** a synthetic demo data loader, a README refresh at the end of each stage, and `docs/ARCHITECTURE.md`.

## What could bite us

- **The toolchain has not been installed together.** Vite 8, TypeScript 6, Preact 11 and WXT 0.21 are all recent. Task 1 is the smoke test. If `@preact/preset-vite` fails, fall back to `"jsx": "react-jsx"` with `"jsxImportSource": "preact"` in `tsconfig.json` and drop the plugin. Any other incompatibility: stop and report.
- **Stage 1 is bigger than the spec's "about 6 hours".** It now carries setup, the gate, docs, demo data and the first signing. Expect four pull requests to review plus about an hour of manual checks.
- **The repository sits under a OneDrive path.** If OneDrive is running, `npm install` is slow and files lock. Pause syncing for this folder before Task 1.
- **The UI is checked by hand.** Each UI task lists what to click. Regressions in screens are not caught by the gate.
- **Real use needs a signed build.** A temporary add-on is removed when Firefox closes. Signing needs the owner's Mozilla API credentials (Task 20).
- **`Alt+Shift+S` may already be taken.** A conflicting shortcut fails silently; the user rebinds it in `about:addons` (stage 2).

## File structure

```
core/
  tsconfig.json                 no DOM library; excludes tests and testing/
  src/status.ts                 status keys, labels, derived current status
  src/types.ts                  record types, Snapshot, Deps, Settings
  src/schema.ts                 APP_ID, SCHEMA_VERSION, STORES, emptySnapshot
  src/repository.ts             Repository interface, WriteOp
  src/memory-repository.ts      in-memory Repository (tests, and the reference for the contract)
  src/dates.ts                  LocalDate helpers
  src/application-ops.ts        create, update, delete, status events
  src/application-list.ts       list rows, search, filter
  src/answers.ts                canonical answers
  src/documents.ts              document records and links
  src/export.ts                 build, parse and validate an export file
  src/migrations.ts             forward-only migrations
  src/demo.ts                   synthetic demo data
  src/*.test.ts                 one test file beside each source file
  testing/fixed-deps.ts         deterministic clock and ids for tests
  testing/repository-contract.ts  one test suite, run against every Repository
  fixtures/v1-export.fixture.json
shell/
  storage/idb-repository.ts     IndexedDB Repository
  storage/settings.ts           settings in storage.local
  storage/persistence.ts        asks for persistent storage, reports the result
  files/download.ts             save a text file through the downloads API
  files/hash.ts                 SHA-256 of a file
  data-service.ts               export and restore orchestration
  deps.ts                       real clock and ids
  open-dashboard.ts             open or focus the dashboard tab
  ui/                           Preact components, route.ts, app-data.tsx, styles.css
entrypoints/
  background.ts                 event page
  dashboard/index.html, main.tsx
guard/
  scan.ts, allowlist.json       bundle text scan
  source-rules.test.ts          lint rule and scanner tests (unit project)
  build.test.ts                 built manifest and bundle checks (build project)
public/icon.svg
docs/ARCHITECTURE.md, docs/RELEASING.md
.github/workflows/ci.yml
```

## Conventions for every task

- Read the header of this plan (through "File structure") and your own task. Grep first; Read only the line ranges you need.
- Test first: write the test, see it fail, implement, see it pass.
- One command per shell call. No `&&`, no `;`, no leading `cd`.
- Single test file: `npx vitest run --project unit <path>`. Gate: `npm run gate`, with output redirected to a scratch file; read only the summary and the failures.
- Commit only the files your task lists, with the message given. No AI attribution.
- **Model** is the implementer model. **Review** names the per-task reviewer (`reviewer-risk` for storage, migrations, dependencies and the privacy guard; otherwise `reviewer-logic`), scoped to the task's diff. At most two fix rounds, then stop and bring it to the owner.
- Every implementer brief ends with: "Hard stop at 80 tool calls: commit what is done, report what remains."

## Pull requests

| PR | Branch | Tasks |
|---|---|---|
| 1. Project setup and gate | `chore/setup-and-gate` | 1 to 3 |
| 2. Core rules | `feat/core` | 4 to 11 |
| 3. Storage, export and restore | `feat/storage` | 12 and 13 |
| 4. Dashboard | `feat/dashboard` | 14 to 20 |

Each branch starts from `main` after the previous pull request merges. The handoff asked for setup, gate and CI in one first task; they are three tasks here to respect the task-size rule, and they ship as one pull request, so every later task still starts with a working gate.

---

# Stage 1: tracker, canonical answers, export and restore

## Task 1: Scaffold the project

**Model:** sonnet. **Review:** reviewer-risk (dependencies).

**Files:**
- Create: `package.json`, `package-lock.json`, `.nvmrc`, `.gitattributes`, `wxt.config.ts`, `tsconfig.json`, `core/tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `public/icon.svg`, `entrypoints/background.ts`, `entrypoints/dashboard/index.html`, `entrypoints/dashboard/main.tsx`, `core/src/status.ts`
- Test: `core/src/status.test.ts`

This task has many files because they are configuration; none holds logic beyond `status.ts`.

**Interfaces:**
- Produces: `STATUS_KEYS: readonly StatusKey[]`, `type StatusKey = (typeof STATUS_KEYS)[number]`, `DEFAULT_STATUS_LABELS: Record<StatusKey, string>`; npm scripts `dev`, `build`, `lint`, `typecheck`, `test`.

- [ ] **Step 1: Create `package.json` and install pinned dependencies**

`"private": true`, `"version": "0.1.0"`, `"type": "module"`, `"engines": { "node": ">=22.12.0" }`. `.nvmrc` holds `22.20.0`. `.gitattributes` holds `* text=auto eol=lf` (so Prettier agrees on Windows and in CI).

Runtime: `preact@11.2.0`, `idb@8.0.4`.
Dev: `wxt@0.21.5`, `vite@8.3.8`, `typescript@6.0.3`, `@preact/preset-vite@2.10.6`, `@babel/core@7.29.13`, `vitest@5.1.0`, `fake-indexeddb@6.2.8`, `eslint@10.15.0`, `typescript-eslint@8.72.2`, `prettier@3.10.1`, `web-ext@10.8.0`, `@types/node@22.20.5`.

Scripts:

```json
{
  "postinstall": "wxt prepare",
  "dev": "wxt -b firefox --mv3",
  "build": "wxt build -b firefox --mv3",
  "lint": "eslint . --max-warnings 0 && prettier --check .",
  "typecheck": "tsc -p core/tsconfig.json --noEmit && tsc --noEmit",
  "test": "vitest run --project unit"
}
```

- [ ] **Step 2: Write `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  imports: false,
  vite: () => ({ plugins: [preact()], build: { modulePreload: false } }),
  manifest: ({ command }) => ({
    name: 'Countersign',
    description:
      'A local-only job search companion. Nothing runs until you click, and nothing leaves your machine.',
    permissions: [],
    action: { default_title: 'Countersign', default_icon: 'icon.svg' },
    icons: { 48: 'icon.svg', 96: 'icon.svg' },
    browser_specific_settings: {
      gecko: {
        id: 'countersign@firegiant9000',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
    ...(command === 'build'
      ? {
          content_security_policy: {
            extension_pages:
              "default-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'",
          },
        }
      : {}),
  }),
});
```

The strict policy applies to builds only; `wxt dev` needs its websocket. Confirm the `command` values and the `imports: false` option against the types in `node_modules/wxt` before relying on them.

- [ ] **Step 3: Write the TypeScript, lint and test configuration**

- `tsconfig.json`: `{ "extends": "./.wxt/tsconfig.json", "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "preact" } }`.
- `core/tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module` and `moduleResolution` set for a bundler, `"lib": ["ES2023"]`, `"types": []`, `"skipLibCheck": true`; `include: ["src"]`, `exclude: ["src/**/*.test.ts"]`.
- `eslint.config.js`: flat config with `typescript-eslint` `recommendedTypeChecked`; ignores `.output`, `.wxt`, `node_modules`. For `core/**`: `no-restricted-imports` for `wxt`, `wxt/*`, `preact`, `preact/*`, `idb`, and any path into `shell/` or `entrypoints/`; `no-restricted-globals` for `browser`, `chrome`, `window`, `document`, `navigator`, `indexedDB`, `localStorage`.
- `.prettierrc.json`: `{ "singleQuote": true }`. `.prettierignore`: `.output`, `.wxt`, `package-lock.json`.
- `vitest.config.ts`: two projects. `unit` includes `core/**/*.test.ts`, `shell/**/*.test.ts` and `guard/source-rules.test.ts`, environment `node`. `build` includes `guard/build.test.ts`.

- [ ] **Step 4: Write the failing test** in `core/src/status.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_STATUS_LABELS, STATUS_KEYS } from './status';

describe('default statuses', () => {
  it('lists the ten statuses in spec order', () => {
    expect(STATUS_KEYS).toEqual([
      'interested', 'applied', 'recruiter_contact', 'phone_screen', 'interview',
      'offer', 'accepted', 'rejected', 'no_response', 'withdrawn',
    ]);
  });
  it('labels every status', () => {
    expect(DEFAULT_STATUS_LABELS).toEqual({
      interested: 'Interested', applied: 'Applied', recruiter_contact: 'Recruiter contact',
      phone_screen: 'Phone screen', interview: 'Interview', offer: 'Offer',
      accepted: 'Accepted', rejected: 'Rejected', no_response: 'No response',
      withdrawn: 'Withdrawn',
    });
  });
});
```

- [ ] **Step 5: Run it.** `npx vitest run --project unit core/src/status.test.ts`. Expected: FAIL, cannot resolve `./status`.
- [ ] **Step 6: Implement `core/src/status.ts`** with the three exports. Run again. Expected: PASS, 2 tests.
- [ ] **Step 7: Add the minimal extension.** `public/icon.svg` is an original, simple mark. `entrypoints/dashboard/index.html` has `<title>Countersign</title>`, a root `<div id="app">` and a module script for `main.tsx`; `main.tsx` renders an `<h1>Countersign</h1>` with Preact. `entrypoints/background.ts` is `export default defineBackground(() => {})` with `defineBackground` imported explicitly.
- [ ] **Step 8: Verify.** Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, one call each. Expected: all exit 0, and `.output/firefox-mv3/manifest.json` exists with `"manifest_version": 3`.
- [ ] **Step 9: Commit** with message `Scaffold WXT project with lint, typecheck and unit tests`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 2: Privacy guard and the gate

**Model:** sonnet. **Review:** reviewer-risk.

**Files:**
- Create: `guard/scan.ts`, `guard/allowlist.json`
- Modify: `eslint.config.js`, `package.json`
- Test: `guard/source-rules.test.ts`, `guard/build.test.ts` (the two tests are the deliverable)

**Interfaces:**
- Produces:
  - `NETWORK_TOKENS: readonly string[]` = `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`
  - `interface AllowEntry { token: string; near: string; reason: string }`
  - `interface Hit { file: string; token: string; context: string }` (`context` is 60 characters either side)
  - `scanText(file: string, text: string, allow: readonly AllowEntry[]): Hit[]` matches whole words; a hit is dropped when its context contains an entry's `near` for the same token
  - `scanDirectory(dir: string, allow: readonly AllowEntry[]): Hit[]` scans every `.js` and `.html` file under `dir`
  - npm scripts `test:build`, `lint:ext`, `gate`

- [ ] **Step 1: Write the failing unit tests** in `guard/source-rules.test.ts`

```ts
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
    const allow = [{ token: 'fetch', near: 'errorMessage="fetch failed"', reason: 'test' }];
    expect(scanText('a.js', 'var errorMessage="fetch failed";', allow)).toEqual([]);
    expect(scanText('a.js', 'fetch("https://example.com")', allow)).toHaveLength(1);
  });
});

describe('lint rule', () => {
  it.each([
    "fetch('https://example.com');",
    'new XMLHttpRequest();',
    "new WebSocket('wss://example.com');",
    "new EventSource('https://example.com');",
    "navigator.sendBeacon('https://example.com');",
    "window.fetch('https://example.com');",
    "globalThis.fetch('https://example.com');",
  ])('rejects %s', async (code) => {
    const [result] = await new ESLint().lintText(code, { filePath: 'entrypoints/background.ts' });
    const rules = (result?.messages ?? []).map((m) => m.ruleId ?? '');
    expect(rules.some((id) => id.startsWith('no-restricted'))).toBe(true);
  });
});
```

The file path must be a real project file so the typed lint config can load it; the assertion checks the rule id so a parse error cannot pass the test by accident.

- [ ] **Step 2: Run it.** Expected: FAIL, `./scan` missing and the lint cases report zero errors.
- [ ] **Step 3: Implement `guard/scan.ts`** and add the rule to `eslint.config.js` for all project source: `no-restricted-globals` for the four constructors and `fetch`; `no-restricted-properties` for `fetch` on `window`, `globalThis` and `self`; `no-restricted-syntax` for any member named `sendBeacon`. `guard/allowlist.json` starts as `[]`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Write the build test** in `guard/build.test.ts`. It reads `.output/firefox-mv3`.

```ts
const ALLOWED = ['activeTab', 'alarms', 'downloads', 'scripting', 'storage', 'unlimitedStorage'];

it('is Manifest V3', () => expect(manifest.manifest_version).toBe(3));
it('asks only for allowed permissions', () => {
  for (const p of manifest.permissions ?? []) expect(ALLOWED).toContain(p);
});
it('has no host access', () => {
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_host_permissions).toBeUndefined();
  expect(manifest.optional_permissions).toBeUndefined();
});
it('declares no content scripts or web-accessible resources', () => {
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
});
it('blocks every connection on extension pages', () => {
  const csp = manifest.content_security_policy.extension_pages;
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toMatch(/https?:|wss?:|\*/);
});
it('uses an event page, not a service worker', () => {
  expect(Array.isArray(manifest.background.scripts)).toBe(true);
  expect(manifest.background.service_worker).toBeUndefined();
  expect(manifest.background.persistent).not.toBe(true);
});
it('declares its identity and no data collection', () => {
  const gecko = manifest.browser_specific_settings.gecko;
  expect(gecko.id).toBe('countersign@firegiant9000');
  expect(gecko.strict_min_version).toBe('140.0');
  expect(gecko.data_collection_permissions).toEqual({ required: ['none'] });
});
it('ships no network calls', () => {
  expect(scanDirectory('.output/firefox-mv3', allowlist)).toEqual([]);
});
it('loads nothing remote from its pages', () => {
  // every src and href in built .html files is a relative or root-relative path
});
```

- [ ] **Step 6: Add scripts** `"test:build": "vitest run --project build"`, `"lint:ext": "web-ext lint --source-dir .output/firefox-mv3"`, and `"gate": "npm run lint && npm run typecheck && npm run test && npm run build && npm run test:build && npm run lint:ext"`.
- [ ] **Step 7: Run `npm run gate`.** Expected: exit 0. If the bundle scan reports Vite's module-preload helper, fix the Vite option rather than allowlisting it. Add an allowlist entry only for a string inside a dependency that is not a call, with a reason; list every entry in the task report. If the manifest has `service_worker` instead of `background.scripts`, stop and report.
- [ ] **Step 8: Prove the guard bites.** Temporarily add `host_permissions: ['<all_urls>']` to `wxt.config.ts`, run `npm run build`, then `npm run test:build`. Expected: FAIL on "has no host access". Revert the change and confirm the gate passes again.
- [ ] **Step 9: Record the `web-ext lint` result** (errors and warnings, by code) in the task report. Task 3 writes the warning count into `CONTRIBUTING.md`.
- [ ] **Step 10: Commit** with message `Add privacy guard and the gate script`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 3: Continuous integration and contributor docs

**Model:** haiku. **Review:** reviewer-risk (workflow permissions and pins).

**Files:**
- Create: `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `CLAUDE.md`, `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run gate
```

- [ ] **Step 2: Write `CONTRIBUTING.md`:** how to install, `npm run dev` (needs Firefox 147 or later), the gate and its six parts, the warning budgets (ESLint: zero; `web-ext lint`: zero errors, and the warning count measured in Task 2, which may not grow without a note in the pull request), branch and pull request rules, the synthetic-fixtures rule, and the fixture naming rule.
- [ ] **Step 3: Write `CLAUDE.md`,** five lines: the gate is `npm run gate`; rules are in `CONTRIBUTING.md`; the spec and plan paths; `core/` must stay free of DOM and `browser.*`; never `git add docs/superpowers/prompts/`.
- [ ] **Step 4: Write `.env.example`** with `WEB_EXT_API_KEY=` and `WEB_EXT_API_SECRET=` and a comment that real values are set in the shell session that runs `web-ext sign` (or in an ignored `.env.local` that the owner loads by hand); nothing in the project reads them.
- [ ] **Step 5: Rewrite `README.md`** to open with the name, one sentence on what it is, and the three claims in this order: local only; nothing runs until you click; never submits anything. Then a "Status" line (stage 1 in progress) and links to the spec and this plan. Task 19 writes the full README.
- [ ] **Step 6: Run `npm run gate`.** Expected: exit 0 (Prettier checks the new files).
- [ ] **Step 7: Commit** with message `Add CI workflow and contributor docs`. After the pull request opens, confirm the `gate` check runs and passes.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 4: Core types, repository interface and in-memory repository

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/types.ts`, `core/src/schema.ts`, `core/src/repository.ts`, `core/src/memory-repository.ts`, `core/testing/fixed-deps.ts`, `core/testing/repository-contract.ts`
- Test: `core/src/memory-repository.test.ts`

**Interfaces:**
- Consumes: `StatusKey` from `core/src/status.ts`.
- Produces (`types.ts`):

```ts
export type Id = string;
export type IsoInstant = string; // from Date.prototype.toISOString()
export type LocalDate = string; // 'YYYY-MM-DD', a calendar day in the user's local time
export type Actor = 'me' | 'them';
export interface BaseRecord { id: Id; createdAt: IsoInstant }

export interface Company extends BaseRecord { name?: string }
export interface Application extends BaseRecord {
  companyId?: Id; title?: string; url?: string;
  nextActionDate?: LocalDate; nextActor?: Actor;
  resumeDocumentId?: Id; coverLetterDocumentId?: Id; notes?: string;
}
export interface StatusEvent extends BaseRecord {
  applicationId?: Id; status?: StatusKey; occurredOn?: LocalDate;
  note?: string; voidedAt?: IsoInstant;
}
export interface DocumentRecord extends BaseRecord { label?: string; fileName?: string; sha256?: string }

export type AnswerType = 'yes_no' | 'choice' | 'money_range' | 'date' | 'text';
export type AnswerValue =
  | { type: 'yes_no'; value: boolean }
  | { type: 'choice'; value: string }
  | { type: 'money_range'; min?: number; max?: number; currency?: string; period?: 'year' | 'hour' }
  | { type: 'date'; value: LocalDate }
  | { type: 'text'; value: string };
export interface AnswerRevision { value: AnswerValue; replacedAt: IsoInstant }
export interface CanonicalAnswer extends BaseRecord {
  key?: string; label?: string; type?: AnswerType; choices?: string[];
  value?: AnswerValue; history?: AnswerRevision[];
}

export interface StoreMap {
  companies: Company; applications: Application; statusEvents: StatusEvent;
  documents: DocumentRecord; canonicalAnswers: CanonicalAnswer;
}
export type StoreName = keyof StoreMap;
export type Snapshot = { [S in StoreName]: StoreMap[S][] };
export interface Deps { now(): IsoInstant; newId(): Id }
export interface Settings { statusLabels?: Partial<Record<StatusKey, string>> }
```

- Produces (`schema.ts`): `APP_ID = 'countersign'`, `SCHEMA_VERSION = 1`, `STORES: readonly { name: StoreName; since: number }[]` (the five stores, `since: 1`), `emptySnapshot(): Snapshot`.
- Produces (`repository.ts`):

```ts
export type WriteOp = {
  [S in StoreName]:
    | { kind: 'put'; store: S; record: StoreMap[S] }
    | { kind: 'delete'; store: S; id: Id };
}[StoreName];

export interface Repository {
  snapshot(): Promise<Snapshot>; // every record of every store, as copies
  apply(ops: readonly WriteOp[]): Promise<void>; // all or nothing
  replaceAll(data: Snapshot): Promise<void>; // all or nothing; restore only
}
```

- Produces: `createMemoryRepository(): Repository`; `fixedDeps(start?: IsoInstant): Deps` (ids `id-1`, `id-2`, …; `now()` starts at `2026-01-05T09:00:00.000Z` and advances one second per call); `describeRepositoryContract(name: string, make: () => Promise<Repository>): void`.

- [ ] **Step 1: Write the contract suite** in `core/testing/repository-contract.ts`, with these tests:

```ts
it('starts empty') // snapshot() equals emptySnapshot()
it('returns what apply put') // one company, one application
it('replaces a record that has the same id')
it('deletes only the named record')
it('applies a batch all or nothing') // [put company, put application without an id] rejects; companies stays []
it('replaceAll swaps every store') // an old application is gone, the new company is there
it('replaceAll is all or nothing') // a record without an id rejects; the old data is intact
it('returns copies') // mutating a returned record does not change the next snapshot
it('keeps fields it does not know') // a record with an extra field round-trips deep-equal
```

- [ ] **Step 2: Write `core/src/memory-repository.test.ts`:** `describeRepositoryContract('memory', async () => createMemoryRepository())`.
- [ ] **Step 3: Run it.** Expected: FAIL, modules missing.
- [ ] **Step 4: Implement** the types, schema, interface, `fixedDeps` and `createMemoryRepository`. The memory repository validates every op (a put needs a non-empty string `id`) before it changes anything.
- [ ] **Step 5: Run it.** Expected: PASS, 9 tests. Run `npm run typecheck`: `core/` must compile with no DOM library.
- [ ] **Step 6: Commit** with message `Add core record types and repository contract`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 5: Local dates

**Model:** haiku. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/dates.ts`
- Test: `core/src/dates.test.ts`

**Interfaces:**
- Produces: `toLocalDate(date: Date): LocalDate` (local calendar day, zero-padded); `isLocalDate(text: string): boolean` (exactly `YYYY-MM-DD` and a real day); `compareLocalDate(a: LocalDate, b: LocalDate): number`.

- [ ] **Step 1: Write the failing tests**

```ts
it('formats the local calendar day', () => {
  expect(toLocalDate(new Date(2026, 10, 14, 23, 30))).toBe('2026-11-14');
  expect(toLocalDate(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
});
it('accepts only real days', () => {
  expect(isLocalDate('2026-02-28')).toBe(true);
  expect(isLocalDate('2028-02-29')).toBe(true);
  expect(isLocalDate('2026-02-30')).toBe(false);
  expect(isLocalDate('2026-2-3')).toBe(false);
  expect(isLocalDate('2026-11-14T00:00:00Z')).toBe(false);
  expect(isLocalDate('')).toBe(false);
});
it('orders days', () => {
  expect(compareLocalDate('2026-03-02', '2026-03-10')).toBeLessThan(0);
  expect(compareLocalDate('2026-03-10', '2026-03-10')).toBe(0);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement.** Never parse a `LocalDate` with `new Date(text)`; that reads it as UTC. **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit** with message `Add local date helpers`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 6: Derived status

**Model:** haiku. **Review:** reviewer-logic.

**Files:**
- Modify: `core/src/status.ts`
- Test: `core/src/status.test.ts` (extend)

**Interfaces:**
- Consumes: `StatusEvent`, `Id` from `types.ts`.
- Produces:
  - `CLOSED_STATUSES: ReadonlySet<string>` = `accepted`, `rejected`, `no_response`, `withdrawn`
  - `effectiveDate(event: StatusEvent): LocalDate` = `occurredOn`, else the first ten characters of `createdAt`
  - `historyFor(events: readonly StatusEvent[], applicationId: Id): StatusEvent[]` oldest first, voided included; order by `effectiveDate`, then `createdAt`, then `id`
  - `currentStatus(events: readonly StatusEvent[], applicationId: Id): StatusEvent | undefined` the last non-voided event of `historyFor`
  - `isArchived(current: StatusEvent | undefined): boolean`
  - `statusLabel(key: string | undefined, overrides?: Partial<Record<string, string>>): string`

- [ ] **Step 1: Write the failing tests**

```ts
const ev = (id: string, status: StatusKey, occurredOn: string | undefined, createdAt: string, extra = {}) =>
  ({ id, createdAt, applicationId: 'a1', status, occurredOn, ...extra });

it('takes the latest event by date, not by entry order', () => {
  const events = [
    ev('e1', 'interview', '2026-03-10', '2026-03-10T10:00:00.000Z'),
    ev('e2', 'applied', '2026-03-02', '2026-03-11T10:00:00.000Z'), // entered later, happened earlier
  ];
  expect(currentStatus(events, 'a1')?.status).toBe('interview');
  expect(historyFor(events, 'a1').map((e) => e.id)).toEqual(['e2', 'e1']);
});
it('orders same-day events by entry time', () => {
  const events = [
    ev('e2', 'rejected', '2026-03-10', '2026-03-10T15:00:00.000Z'),
    ev('e1', 'phone_screen', '2026-03-10', '2026-03-10T09:00:00.000Z'),
  ];
  expect(currentStatus(events, 'a1')?.status).toBe('rejected');
});
it('uses the creation day when occurredOn is missing', () => {
  expect(effectiveDate(ev('e1', 'applied', undefined, '2026-03-04T23:59:00.000Z'))).toBe('2026-03-04');
});
it('ignores voided events for the current status but keeps them in history', () => {
  const events = [
    ev('e1', 'applied', '2026-03-02', '2026-03-02T10:00:00.000Z'),
    ev('e2', 'rejected', '2026-03-05', '2026-03-05T10:00:00.000Z', { voidedAt: '2026-03-05T10:01:00.000Z' }),
  ];
  expect(currentStatus(events, 'a1')?.status).toBe('applied');
  expect(historyFor(events, 'a1')).toHaveLength(2);
});
it('ignores other applications', () => {
  expect(currentStatus([{ ...ev('e1', 'offer', '2026-03-02', '2026-03-02T10:00:00.000Z'), applicationId: 'a2' }], 'a1')).toBeUndefined();
});
it('archives on the four closing statuses only', () => {
  for (const s of ['accepted', 'rejected', 'no_response', 'withdrawn'] as const)
    expect(isArchived(ev('e', s, '2026-03-02', '2026-03-02T10:00:00.000Z'))).toBe(true);
  for (const s of ['interested', 'applied', 'recruiter_contact', 'phone_screen', 'interview', 'offer'] as const)
    expect(isArchived(ev('e', s, '2026-03-02', '2026-03-02T10:00:00.000Z'))).toBe(false);
  expect(isArchived(undefined)).toBe(false);
});
it('labels by override, then default, then the raw key', () => {
  expect(statusLabel('applied', { applied: 'Sent' })).toBe('Sent');
  expect(statusLabel('applied')).toBe('Applied');
  expect(statusLabel('mystery')).toBe('mystery');
  expect(statusLabel(undefined)).toBe('No status');
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run it.** Expected: PASS, 9 tests in the file.
- [ ] **Step 5: Commit** with message `Derive current status from append-only events`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 7: Application operations

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/application-ops.ts`
- Test: `core/src/application-ops.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `Deps`, `WriteOp`, record types.
- Produces:

```ts
export interface NewApplicationInput {
  companyName?: string; title?: string; url?: string; status?: StatusKey;
  occurredOn?: LocalDate; nextActionDate?: LocalDate; nextActor?: Actor; notes?: string;
}
export function findCompanyByName(companies: readonly Company[], name: string): Company | undefined;
export function newApplicationOps(input: NewApplicationInput, data: Snapshot, deps: Deps):
  { ops: WriteOp[]; applicationId: Id };
export type ApplicationPatch = Partial<Omit<Application, 'id' | 'createdAt'>>;
export function updateApplicationOps(app: Application, patch: ApplicationPatch): WriteOp[];
export function addStatusEventOps(applicationId: Id,
  input: { status: StatusKey; occurredOn?: LocalDate; note?: string }, deps: Deps): WriteOp[];
export function voidStatusEventOps(event: StatusEvent, deps: Deps): WriteOp[];
export function deleteApplicationOps(data: Snapshot, applicationId: Id): WriteOp[];
```

Rules: company names match after trimming, collapsing inner whitespace and lower-casing. A blank or whitespace-only string is stored as an absent key, never as `''`. A patch value of `undefined` or blank removes the key. The first status event defaults to `interested`. Deleting an application deletes its status events and nothing else.

- [ ] **Step 1: Write the failing tests**

```ts
it('creates the company, the application and the first status event together', () => {
  const { ops, applicationId } = newApplicationOps(
    { companyName: 'Example Robotics', title: 'Engineer', url: 'https://example.com/jobs/1',
      status: 'applied', occurredOn: '2026-03-02' }, emptySnapshot(), fixedDeps());
  expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual(['put:companies', 'put:applications', 'put:statusEvents']);
  // application.companyId is the new company's id; event.applicationId === applicationId; event.status === 'applied'
});
it('reuses a company whatever the case and spacing', () => {
  const data = { ...emptySnapshot(), companies: [{ id: 'c1', createdAt: T, name: 'Example Robotics' }] };
  const { ops } = newApplicationOps({ companyName: '  example   robotics ' }, data, fixedDeps());
  expect(ops.some((o) => o.store === 'companies')).toBe(false);
  // the application's companyId is 'c1'
});
it('needs no fields at all', () => {
  const { ops } = newApplicationOps({}, emptySnapshot(), fixedDeps());
  // two ops; Object.keys(application) equals ['id', 'createdAt']; the event's status is 'interested'
});
it('drops blank strings', () => {
  // { title: '   ', notes: '' } leaves neither key on the application
});
it('updates and clears fields without touching id or createdAt', () => {
  const app = { id: 'a1', createdAt: T, notes: 'old', nextActionDate: '2026-03-09' };
  const [op] = updateApplicationOps(app, { notes: 'new', nextActionDate: undefined });
  // op.record equals { id: 'a1', createdAt: T, notes: 'new' }
});
it('adds a status event', () => { /* one put:statusEvents with the given status, date and note */ });
it('voids an event without changing anything else', () => { /* same record plus voidedAt */ });
it('deletes an application and only its own events', () => {
  // data: applications a1 and a2, events for both, one company, one document
  // result: delete a1, delete a1's events; nothing for a2, the company or the document
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run it.** Expected: PASS, 8 tests.
- [ ] **Step 5: Commit** with message `Add application create, update, status and delete operations`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 8: Application list, search and filter

**Model:** haiku. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/application-list.ts`
- Test: `core/src/application-list.test.ts`

**Interfaces:**
- Consumes: `currentStatus`, `isArchived`, `statusLabel`, `effectiveDate` from `status.ts`.
- Produces:

```ts
export interface ApplicationRow {
  id: Id; companyName: string; title: string; url?: string; notes: string;
  status?: string; statusLabel: string; statusDate?: LocalDate;
  nextActionDate?: LocalDate; nextActor?: Actor; archived: boolean; createdAt: IsoInstant;
}
export function applicationRows(data: Snapshot, labelOverrides?: Partial<Record<string, string>>): ApplicationRow[];
export interface RowFilter { query?: string; status?: string; scope?: 'active' | 'archived' | 'all' }
export function filterRows(rows: readonly ApplicationRow[], filter: RowFilter): ApplicationRow[];
```

Rules: rows sort by `nextActionDate` ascending with undated rows last, then by `createdAt` newest first. The default scope is `active`. The query is split on whitespace; every term must appear, case-insensitively, in the company name, title or notes.

- [ ] **Step 1: Write the failing tests**

```ts
it('joins company, title and status into a row');
it('survives missing links', () => {
  const data = { ...emptySnapshot(), applications: [{ id: 'a1', createdAt: T, companyId: 'gone' }] };
  expect(applicationRows(data)).toEqual([expect.objectContaining(
    { id: 'a1', companyName: '', title: '', notes: '', statusLabel: 'No status', archived: false })]);
});
it('shows an unknown status key as it is', () => { /* status 'on_hold' gives statusLabel 'on_hold', archived false */ });
it('ignores a status event whose application is gone', () => { /* no row, no throw */ });
it('sorts dated next actions first, then newest');
it('hides archived rows by default', () => { /* scope undefined gives active only; 'archived' the rest; 'all' both */ });
it('matches every search term across company, title and notes', () => {
  // 'robotics engineer' matches company 'Example Robotics' with title 'Staff Engineer'
  // 'ROBOTICS' matches; 'robotics designer' does not
});
it('filters by status key');
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run it.** Expected: PASS, 8 tests.
- [ ] **Step 5: Commit** with message `Add application list rows with search and filter`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 9: Canonical answers

**Model:** haiku. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/answers.ts`
- Test: `core/src/answers.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_ANSWERS: readonly { key: string; label: string; type: AnswerType; choices?: string[] }[]`, in this order: `work_authorization` (yes_no, "Authorized to work"), `sponsorship` (yes_no, "Needs sponsorship"), `salary_range` (money_range, "Salary range"), `earliest_start_date` (date, "Earliest start date"), `relocation` (choice of "Yes", "No", "Depends on location"; "Open to relocation"), `reason_for_leaving` (text, "Reason for leaving")
  - `missingDefaultAnswers(existing: readonly CanonicalAnswer[], deps: Deps): CanonicalAnswer[]` matches by `key`
  - `reviseAnswer(answer: CanonicalAnswer, value: AnswerValue | undefined, deps: Deps): CanonicalAnswer` returns the same object when the value is deep-equal; otherwise appends the previous value (if there was one) to `history` with `replacedAt`
  - `answerProblem(value: AnswerValue | undefined): string | undefined`
  - `formatAnswer(value: AnswerValue | undefined): string`

- [ ] **Step 1: Write the failing tests**

```ts
it('offers the six default answers in order', () => {
  expect(DEFAULT_ANSWERS.map((a) => a.key)).toEqual(['work_authorization', 'sponsorship',
    'salary_range', 'earliest_start_date', 'relocation', 'reason_for_leaving']);
});
it('creates only the defaults that are missing', () => {
  const first = missingDefaultAnswers([], fixedDeps());
  expect(first).toHaveLength(6);
  expect(missingDefaultAnswers(first, fixedDeps())).toEqual([]);
  expect(missingDefaultAnswers([{ id: 'x', createdAt: T, key: 'sponsorship' }], fixedDeps())).toHaveLength(5);
});
it('keeps the previous value in history', () => {
  const a0 = { id: 'x', createdAt: T, key: 'sponsorship', type: 'yes_no' as const };
  const a1 = reviseAnswer(a0, { type: 'yes_no', value: false }, fixedDeps());
  expect(a1.history ?? []).toEqual([]); // nothing to remember yet
  const a2 = reviseAnswer(a1, { type: 'yes_no', value: true }, fixedDeps());
  expect(a2.value).toEqual({ type: 'yes_no', value: true });
  expect(a2.history).toEqual([{ value: { type: 'yes_no', value: false }, replacedAt: expect.any(String) }]);
});
it('returns the same object when nothing changed', () => {
  const a = { id: 'x', createdAt: T, value: { type: 'text' as const, value: 'Growth' } };
  expect(reviseAnswer(a, { type: 'text', value: 'Growth' }, fixedDeps())).toBe(a);
});
it('records the old value when the answer is cleared');
it('reports problems', () => {
  expect(answerProblem({ type: 'money_range', min: 140000, max: 120000 })).toBe('Minimum is above maximum.');
  expect(answerProblem({ type: 'date', value: '2026-02-30' })).toBe('Enter a date as YYYY-MM-DD.');
  expect(answerProblem({ type: 'money_range', min: 120000 })).toBeUndefined();
  expect(answerProblem(undefined)).toBeUndefined();
});
it('formats each type', () => {
  expect(formatAnswer({ type: 'yes_no', value: true })).toBe('Yes');
  expect(formatAnswer({ type: 'choice', value: 'Depends on location' })).toBe('Depends on location');
  expect(formatAnswer({ type: 'money_range', min: 120000, max: 140000, currency: 'USD', period: 'year' }))
    .toBe('120,000 to 140,000 USD per year');
  expect(formatAnswer({ type: 'money_range', min: 120000 })).toBe('from 120,000');
  expect(formatAnswer({ type: 'date', value: '2027-01-04' })).toBe('2027-01-04');
  expect(formatAnswer(undefined)).toBe('');
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement.** Group thousands with `toLocaleString('en-US')`. **Step 4: Run it.** Expected: PASS, 7 tests.
- [ ] **Step 5: Commit** with message `Add canonical answers with edit history`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 10: Document records

**Model:** haiku. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/documents.ts`
- Test: `core/src/documents.test.ts`

**Interfaces:**
- Produces:

```ts
export type DocumentSlot = 'resume' | 'coverLetter';
export function attachDocumentOps(app: Application, slot: DocumentSlot,
  file: { fileName: string; sha256: string; label?: string }, data: Snapshot, deps: Deps): WriteOp[];
export function detachDocumentOps(app: Application, slot: DocumentSlot): WriteOp[];
export function documentFor(data: Snapshot, app: Application, slot: DocumentSlot): DocumentRecord | undefined;
```

`resume` maps to `resumeDocumentId`, `coverLetter` to `coverLetterDocumentId`. The file's contents are never stored.

- [ ] **Step 1: Write the failing tests**

```ts
it('creates a document record and links it', () => { /* put:documents then put:applications with resumeDocumentId */ });
it('reuses the record when the hash is already known', () => { /* only put:applications; id of the existing record */ });
it('leaves the old record in place when a different file is attached');
it('detaching clears the link and keeps the record', () => { /* one put:applications without the key; no delete */ });
it('returns undefined for a dangling link', () => { /* documentFor with resumeDocumentId 'gone' */ });
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run it.** Expected: PASS, 5 tests.
- [ ] **Step 5: Commit** with message `Add document records for resumes and cover letters`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 11: Export, validation and migrations

**Model:** sonnet. **Review:** reviewer-risk (data).

**Files:**
- Create: `core/src/export.ts`, `core/src/migrations.ts`, `core/fixtures/v1-export.fixture.json`
- Test: `core/src/export.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `Settings`, `StoreName`, `STORES`, `SCHEMA_VERSION`, `APP_ID`, `createMemoryRepository`.
- Produces:

```ts
export interface ExportFile {
  app: 'countersign'; schemaVersion: number; exportedAt: IsoInstant; data: Snapshot; settings: Settings;
}
export function buildExport(data: Snapshot, settings: Settings, deps: Pick<Deps, 'now'>): ExportFile;
export function exportFileName(kind: 'export' | 'pre-restore', at: IsoInstant): string;
export type ParseResult =
  | { ok: true; file: ExportFile; counts: Record<StoreName, number> }
  | { ok: false; errors: string[] };
export function parseExport(text: string,
  options?: { migrations?: readonly Migration[]; target?: number }): ParseResult;

// migrations.ts
export interface RawExport { schemaVersion: number; data: Record<string, unknown[]>; settings: Record<string, unknown> }
export interface Migration { to: number; migrate(file: RawExport): RawExport }
export const MIGRATIONS: readonly Migration[]; // empty at schema 1
```

Order inside `parseExport`: parse JSON; check the envelope; reject a newer version; run each migration whose `to` is above the file's version, in order, up to the target; then check records against the target's stores. A store missing from the file reads as empty. A store the target does not know is an error. `exportedAt` and `settings` may be absent; `settings` then reads as `{}`. Errors are plain sentences; at most 20 are returned, followed by "and N more." when there are more.

- [ ] **Step 1: Write the fixture.** `core/fixtures/v1-export.fixture.json` is a hand-written schema 1 export with two invented companies, three applications, five status events (one voided), one document and two canonical answers. This file is the anchor for every future migration test and is never edited after this task.
- [ ] **Step 2: Write the failing tests**

```ts
it('builds the envelope', () => {
  const file = buildExport(emptySnapshot(), {}, { now: () => '2026-11-14T15:30:00.000Z' });
  expect(file).toEqual({ app: 'countersign', schemaVersion: 1, exportedAt: '2026-11-14T15:30:00.000Z',
    data: emptySnapshot(), settings: {} });
});
it('names files so that .gitignore catches them', () => {
  expect(exportFileName('export', '2026-11-14T15:30:00.000Z')).toBe('countersign-export-20261114-153000Z.json');
  expect(exportFileName('pre-restore', '2026-11-14T15:30:00.000Z'))
    .toBe('countersign-export-pre-restore-20261114-153000Z.json');
});
it('round-trips: export, parse, restore into an empty repository', async () => {
  // fill a memory repository, buildExport, JSON.stringify, parseExport, replaceAll into a second repository
  // the second snapshot deep-equals the first; counts match the store sizes
});
it('reads the schema 1 fixture', () => { /* ok is true; counts: 2, 3, 5, 1, 2 */ });
it('keeps fields it does not know');
it('reads a missing store as empty');
it.each([
  ['{ not json', 'This is not a JSON file.'],
  ['[]', 'This is not a Countersign export.'],
  ['{"app":"other","schemaVersion":1,"data":{}}', 'This is not a Countersign export.'],
  ['{"app":"countersign","schemaVersion":"1","data":{}}', 'The schema version is missing or not a whole number.'],
  ['{"app":"countersign","schemaVersion":99,"data":{}}',
    'This file was made by a newer version of Countersign (schema 99). Update the extension first.'],
  ['{"app":"countersign","schemaVersion":1}', 'The file has no data section.'],
  ['{"app":"countersign","schemaVersion":1,"data":{"applications":{}}}', 'applications is not a list.'],
  ['{"app":"countersign","schemaVersion":1,"data":{"widgets":[]}}', 'Unknown store "widgets".'],
  ['{"app":"countersign","schemaVersion":1,"data":{"applications":[{"createdAt":"2026-01-05T09:00:00.000Z"}]}}',
    'applications[0] has no id.'],
  ['{"app":"countersign","schemaVersion":1,"data":{"applications":[{"id":"a1"}]}}',
    'applications[0] has no createdAt.'],
])('rejects %s', (text, message) => {
  expect(parseExport(text)).toEqual({ ok: false, errors: [message] });
});
it('rejects two records with the same id in one store', () => { /* 'applications has two records with id "a1".' */ });
it('caps the error list at 20', () => { /* 30 bad records give 21 entries; the last is 'and 10 more.' */ });
it('runs migrations in order, forward only', () => {
  const calls: number[] = [];
  const step = (to: number): Migration => ({ to, migrate: (f) => { calls.push(to); return { ...f, schemaVersion: to }; } });
  const text = JSON.stringify({ app: 'countersign', schemaVersion: 2, exportedAt: T, data: {}, settings: {} });
  const result = parseExport(text, { migrations: [step(2), step(3), step(4)], target: 4 });
  expect(result.ok).toBe(true);
  expect(calls).toEqual([3, 4]);
});
it('refuses when a migration step is missing', () => {
  // version 1, migrations [step(3)], target 3 gives 'No migration path from schema 1 to schema 3.'
});
```

- [ ] **Step 3: Run it.** Expected: FAIL. **Step 4: Implement.** **Step 5: Run it.** Expected: PASS, 20 tests (10 from the table).
- [ ] **Step 6: Run `npm run gate`**, then commit with message `Add export, validation and forward-only migrations`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 12: IndexedDB repository

**Model:** sonnet. **Review:** reviewer-risk (data).

**Files:**
- Create: `shell/storage/idb-repository.ts`
- Modify: `wxt.config.ts` (add `unlimitedStorage` to `permissions`)
- Test: `shell/storage/idb-repository.test.ts`

**Interfaces:**
- Consumes: `Repository`, `WriteOp`, `STORES`, `SCHEMA_VERSION`, `describeRepositoryContract`.
- Produces: `openIdbRepository(options?: { dbName?: string }): Promise<Repository>`. The database name defaults to `countersign`; its version is `SCHEMA_VERSION`; every store uses `keyPath: 'id'` and has no secondary index. `upgrade` creates each store in `STORES` whose `since` is above the old version. `apply` and `replaceAll` each run in one transaction across the stores they touch. The connection closes itself on `versionchange`.

- [ ] **Step 1: Write the failing tests**

```ts
import 'fake-indexeddb/auto';

let n = 0;
describeRepositoryContract('indexeddb', () => openIdbRepository({ dbName: `contract-${n++}` }));

it('keeps records after the database is reopened');
it('creates every store in STORES', async () => { /* open, then list objectStoreNames through indexedDB.open */ });
it('explains a database written by a newer version', async () => {
  // create dbName at version SCHEMA_VERSION + 1 with raw indexedDB, then:
  await expect(openIdbRepository({ dbName })).rejects.toThrow(
    'This data was written by a newer version of Countersign.');
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement** with `openDB` from `idb`. **Step 4: Run it.** Expected: PASS, 12 tests.
- [ ] **Step 5: Run `npm run gate`.** Expected: exit 0; the built manifest's permissions are `["unlimitedStorage"]`.
- [ ] **Step 6: Commit** with message `Add IndexedDB repository`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 13: Settings, file saving and the data service

**Model:** sonnet. **Review:** reviewer-risk (data).

**Files:**
- Create: `shell/storage/settings.ts`, `shell/files/download.ts`, `shell/data-service.ts`
- Modify: `wxt.config.ts` (add `storage` and `downloads` to `permissions`)
- Test: `shell/data-service.test.ts`

**Interfaces:**
- Consumes: `Repository`, `buildExport`, `exportFileName`, `ExportFile`, `Settings`, `Deps`.
- Produces:

```ts
// settings.ts
export interface KeyValueArea { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
export function browserLocalArea(): KeyValueArea; // wraps browser.storage.local
export function loadSettings(area: KeyValueArea): Promise<Settings>; // key 'settings'; {} when absent
export function saveSettings(area: KeyValueArea, settings: Settings): Promise<void>;

// download.ts
export interface FileSaver {
  save(path: string, text: string, options: { saveAs: boolean }): Promise<void>;
}
export function browserFileSaver(): FileSaver;

// data-service.ts
export interface DataService { exportNow(): Promise<void>; restore(file: ExportFile): Promise<void> }
export function createDataService(deps:
  { repo: Repository; area: KeyValueArea; saver: FileSaver; clock: Pick<Deps, 'now'> }): DataService;
```

`FileSaver.save` resolves only when the file is fully written and rejects when the download is cancelled or interrupted. `browserFileSaver` makes a blob URL, calls `browser.downloads.download({ url, filename: path, saveAs, conflictAction: 'uniquify' })`, waits on `downloads.onChanged` for `complete` or `interrupted`, and revokes the URL afterwards in both cases.

`restore` does these in order and stops at the first failure: save the current data as `Countersign/<exportFileName('pre-restore', now)>` with `saveAs: false` (skipped when every store is empty); `repo.replaceAll(file.data)`; `saveSettings(area, file.settings)`.

- [ ] **Step 1: Write the failing tests** with a memory repository, a map-backed `KeyValueArea`, and a fake `FileSaver` that records calls and can be told to reject.

```ts
it('exports everything to one file the user places', async () => {
  // one save: path 'countersign-export-20261114-153000Z.json', saveAs true
  // parseExport(saved text) is ok and its data equals the repository snapshot; settings are included
});
it('saves a safety copy before it replaces anything', async () => {
  // call log is ['save', 'replaceAll', 'saveSettings']
  // the save path is 'Countersign/countersign-export-pre-restore-20261114-153000Z.json', saveAs false
  // the saved text holds the old data, not the new
});
it('skips the safety copy when there is nothing to lose', async () => { /* empty repository: no save, data replaced */ });
it('stops when the safety copy fails', async () => {
  // the saver rejects: restore rejects, the snapshot is unchanged, the settings are unchanged
});
it('leaves settings alone when the data swap fails', async () => {
  // replaceAll rejects: restore rejects, saveSettings is never called
});
it('loads empty settings when none are stored', async () => { /* loadSettings gives {} */ });
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run it.** Expected: PASS, 6 tests.
- [ ] **Step 5: Run `npm run gate`**, then commit with message `Add settings, file saving and export/restore service`.

`browserLocalArea` and `browserFileSaver` wrap browser APIs and are checked by hand in Task 20.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 14: Dashboard shell

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `shell/ui/route.ts`, `shell/ui/app-data.tsx`, `shell/ui/App.tsx`, `shell/ui/styles.css`, `shell/deps.ts`, `shell/open-dashboard.ts`
- Modify: `entrypoints/dashboard/main.tsx`, `entrypoints/background.ts`
- Test: `shell/ui/route.test.ts`

**Interfaces:**
- Consumes: `openIdbRepository`, `browserLocalArea`, `loadSettings`, `browserFileSaver`, `createDataService`, `missingDefaultAnswers`.
- Produces:

```ts
// route.ts
export type Route =
  | { page: 'applications' } | { page: 'application'; id: string }
  | { page: 'answers' } | { page: 'data' };
export function parseRoute(hash: string): Route;
export function routeHref(route: Route): string;

// deps.ts
export function browserDeps(): Deps; // crypto.randomUUID() and new Date().toISOString()

// app-data.tsx
export interface AppData {
  data: Snapshot; settings: Settings; deps: Deps; service: DataService;
  apply(ops: readonly WriteOp[]): Promise<void>; // writes, then reloads the snapshot
  reload(): Promise<void>;
}
export function AppDataProvider(props: { children: ComponentChildren }): VNode;
export function useAppData(): AppData;

// open-dashboard.ts
export function openDashboard(): Promise<void>;
```

`AppDataProvider` opens the repository once, creates any missing default answers, loads the snapshot and settings, and shows a plain error message (with the reason) if the database cannot be opened. `App` renders a navigation bar (Applications, Answers, Data) and the page for the current route; later tasks replace the three placeholder pages. `openDashboard` focuses an existing dashboard tab if `browser.tabs.query({ url })` finds one, and otherwise creates it. The event page registers `browser.action.onClicked.addListener(() => void openDashboard())` at the top level of `main`.

Design rule for all UI tasks: plain and fast. System font, one stylesheet, no animation, no tutorial, no empty-state lecture.

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ['', { page: 'applications' }],
  ['#/', { page: 'applications' }],
  ['#/applications', { page: 'applications' }],
  ['#/applications/abc-123', { page: 'application', id: 'abc-123' }],
  ['#/applications/a%20b', { page: 'application', id: 'a b' }],
  ['#/answers', { page: 'answers' }],
  ['#/data', { page: 'data' }],
  ['#/nonsense', { page: 'applications' }],
])('parses %s', (hash, route) => expect(parseRoute(hash)).toEqual(route));
it('round-trips through routeHref', () => {
  for (const r of [{ page: 'application', id: 'a b' }, { page: 'answers' }] as Route[])
    expect(parseRoute(routeHref(r))).toEqual(r);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement** the files above. **Step 4: Run it.** Expected: PASS, 9 tests.
- [ ] **Step 5: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 6: Commit** with message `Add dashboard shell, routing and data loading`.

Hand check (owner, at review): `npm run dev`; clicking the toolbar button opens the dashboard; clicking again focuses the same tab; the three navigation links change the page.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 15: Applications page

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `shell/ui/ApplicationsPage.tsx`, `shell/ui/ApplicationForm.tsx`
- Modify: `shell/ui/App.tsx`, `shell/ui/styles.css`

**Interfaces:**
- Consumes: `useAppData`, `applicationRows`, `filterRows`, `newApplicationOps`, `STATUS_KEYS`, `statusLabel`, `toLocalDate`, `routeHref`.
- Produces: `ApplicationsPage(): VNode`; `ApplicationForm(props: { onSaved(id: Id): void }): VNode`.

The page shows a search box, a status select (All plus the ten statuses), a scope switch (Active, Archived, All), and a table with columns Company, Title, Status, Next action, Who acts. Each row links to the application. The form has Company, Title, URL, Status (default Applied), Date (default today), Next action date, Who acts next, Notes. No field is required. Saving calls `newApplicationOps` and `apply`, then clears the form. All logic stays in the `core/` functions; the components hold only input state.

- [ ] **Step 1: Implement the two components** and route `applications` to the page.
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 3: Commit** with message `Add applications page with search, filters and manual entry`.

Hand check (owner, at review): add an application with only a company; add one with every field; add a second for the same company typed in a different case and confirm no second company appears; search by a word in the notes; switch scope.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 16: Application detail

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `shell/ui/ApplicationDetail.tsx`, `shell/ui/DocumentField.tsx`, `shell/files/hash.ts`
- Modify: `shell/ui/App.tsx`
- Test: `shell/files/hash.test.ts`

**Interfaces:**
- Consumes: `historyFor`, `currentStatus`, `statusLabel`, `updateApplicationOps`, `addStatusEventOps`, `voidStatusEventOps`, `deleteApplicationOps`, `attachDocumentOps`, `detachDocumentOps`, `documentFor`.
- Produces: `sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string>` (lower-case hex, through `crypto.subtle.digest`); `ApplicationDetail(props: { id: Id }): VNode`; `DocumentField(props: { app: Application; slot: DocumentSlot; label: string }): VNode`.

The page shows the company and editable title, URL (opened with `target="_blank" rel="noopener noreferrer"`), next-action date, who acts next and notes, each saved on change. Status history lists every event oldest first with date, label and note; voided events are struck through. "Add status" takes a status, a date (default today) and a note. The latest non-voided event has an "Undo" action that voids it. `DocumentField` shows the linked record's label, file name and the first 12 characters of its hash; "Choose file" reads the file, hashes it and attaches it; the file itself is not stored. "Delete application" asks for confirmation, deletes, and returns to the list. An unknown id shows "This application no longer exists." with a link back.

- [ ] **Step 1: Write the failing test**

```ts
it('hashes bytes to lower-case hex', async () => {
  expect(await sha256Hex(new TextEncoder().encode('abc')))
    .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement** `hash.ts`, then the two components. **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Run `npm run gate`**, then commit with message `Add application detail with status history and documents`.

Hand check (owner, at review): add a backdated "Applied" after a later "Interview" and confirm the current status stays Interview; mark Rejected, confirm the row leaves the active list, then Undo and confirm it returns; attach a file as the resume, then attach the same file to another application and confirm one document record is reused; delete an application.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 17: Canonical answers page

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `shell/ui/AnswersPage.tsx`, `shell/ui/AnswerEditor.tsx`
- Modify: `shell/ui/App.tsx`

**Interfaces:**
- Consumes: `useAppData`, `DEFAULT_ANSWERS`, `reviseAnswer`, `answerProblem`, `formatAnswer`.
- Produces: `AnswersPage(): VNode`; `AnswerEditor(props: { answer: CanonicalAnswer }): VNode`.

The page lists the answers in `DEFAULT_ANSWERS` order, then any others by label. `AnswerEditor` shows the input that fits the type: yes/no as two radio buttons, choice as a select of `choices`, money range as minimum, maximum, currency and a per-year or per-hour select, date as a date input, text as a textarea. Saving calls `reviseAnswer` and applies a put only when the returned object differs. A problem from `answerProblem` is shown beside the input and blocks the save. Each answer has a collapsed "History" list showing `formatAnswer(value)` and the date it was replaced, newest first.

- [ ] **Step 1: Implement the two components** and route `answers` to the page.
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 3: Commit** with message `Add canonical answers page`.

Hand check (owner, at review): set each of the six answers; change one twice and confirm two history entries; enter a minimum above the maximum and confirm the message.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 18: Data page and demo data

**Model:** sonnet. **Review:** reviewer-risk (data).

**Files:**
- Create: `core/src/demo.ts`, `shell/storage/persistence.ts`, `shell/ui/DataPage.tsx`
- Modify: `shell/ui/App.tsx`
- Test: `core/src/demo.test.ts`

**Interfaces:**
- Consumes: `useAppData` (`service.exportNow`, `service.restore`), `parseExport`, `buildExport`.
- Produces:

```ts
// demo.ts
export const DEMO_PREFIX = 'demo-';
export function buildDemoOps(today: LocalDate, deps: Pick<Deps, 'now'>): WriteOp[];
export function canLoadDemo(data: Snapshot): boolean; // true only with no applications and no companies
export function hasDemoData(data: Snapshot): boolean;
export function removeDemoOps(data: Snapshot): WriteOp[]; // deletes records whose id starts with DEMO_PREFIX

// persistence.ts
export type PersistenceState = 'persistent' | 'best-effort' | 'unknown';
export function requestPersistence(): Promise<PersistenceState>; // navigator.storage.persist(), then persisted()
```

Demo data: four invented companies, eight applications spread across the ten statuses (at least two archived), status histories of one to four events dated relative to `today`, two document records with made-up hashes. Every id starts with `demo-`, every URL is under `https://example.com/`, and no name is a real company or person.

The page has four parts. **Export:** a button that calls `exportNow`. **Restore:** a file input; the chosen file goes through `parseExport`; errors are listed, or a summary (export date and record count per store) is shown with a "Replace all data" button that asks for confirmation and calls `restore`; a failure is shown with its reason and the sentence "Nothing was changed." **Storage:** one line from `requestPersistence` ("Storage is protected from eviction." or "Storage is best-effort; keep exports."). **Demo data:** "Load demo data" when `canLoadDemo`, "Remove demo data" when `hasDemoData`, and a note that demo records are fictional.

- [ ] **Step 1: Write the failing tests**

```ts
it('marks every demo record', () => {
  const ops = buildDemoOps('2026-11-14', fixedDeps());
  expect(ops.every((o) => o.kind === 'put' && o.record.id.startsWith('demo-'))).toBe(true);
});
it('uses only example.com addresses', () => { /* every application url starts with 'https://example.com/' */ });
it('shows active and archived applications', async () => {
  // apply the ops to a memory repository; applicationRows has 8 rows, at least 2 archived, at least 4 active
});
it('passes export validation', async () => { /* buildExport of the demo snapshot, stringify, parseExport is ok */ });
it('loads only into an empty tracker', () => {
  expect(canLoadDemo(emptySnapshot())).toBe(true);
  expect(canLoadDemo({ ...emptySnapshot(), companies: [{ id: 'c1', createdAt: T }] })).toBe(false);
});
it('removes demo records and nothing else', async () => {
  // demo data plus one real company and application; after removeDemoOps only the real two remain
});
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement** `demo.ts`, `persistence.ts` and the page. **Step 4: Run it.** Expected: PASS, 6 tests.
- [ ] **Step 5: Run `npm run gate`**, then commit with message `Add data page: export, restore, storage status and demo data`.

Hand check (owner, at review): load demo data, export, remove demo data, restore the export and confirm the eight applications return and a `Countersign/countersign-export-pre-restore-*.json` file was written only when there was data to save; choose a text file and confirm the error; cancel the confirmation and confirm nothing changes.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 19: README, architecture and release notes

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `docs/ARCHITECTURE.md`, `docs/RELEASING.md`
- Modify: `README.md`

No personal details, no real companies, and no claim that is not backed by a test or a manifest line.

- [ ] **Step 1: Write `README.md`,** in this order:
  1. Name, one sentence, CI badge.
  2. The three claims: local only; nothing runs until you click; never submits anything.
  3. "How the claims are enforced": a table with one row per claim, linking to `guard/build.test.ts`, the lint rule in `eslint.config.js`, and the CSP line in `wxt.config.ts`.
  4. A screenshot placeholder, `docs/screenshots/applications.png`, with a comment that it is taken from demo data (the owner adds the image in Task 20).
  5. "What it does today" (stage 1 features) and "What is next" (stages 2 and 3, one line each).
  6. "What it will never do": the spec's anti-goals, section 2.
  7. Permissions table: each permission in the built manifest and the reason for it.
  8. "Build and run": Node version, `npm ci`, `npm run dev`, `npm run gate`, loading `.output/firefox-mv3` through `about:debugging`.
  9. Links to the spec, this plan, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md` and the licence.
- [ ] **Step 2: Write `docs/ARCHITECTURE.md`,** one page: the `core/` and shell split and how it is enforced; the snapshot-and-operations data flow; the record types and why only `id` and `createdAt` are required; schema versions and migrations; the privacy guard's three parts; and "Decisions made in this plan", items 1 to 10, each with its reason in a sentence.
- [ ] **Step 3: Write `docs/RELEASING.md`:** bump the version in `package.json`; run the gate; sign with `npx web-ext sign --source-dir .output/firefox-mv3 --channel unlisted`, with credentials in the `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` environment variables and never in the repository; install the signed file; export before every update.
- [ ] **Step 4: Run `npm run gate`**, then commit with message `Write README, architecture notes and release steps`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 20: Stage 1 release (owner)

Not an implementer task. These steps need a real Firefox profile and the owner's Mozilla credentials.

- [ ] **Step 1: Run the hand checks** from Tasks 14 to 18 against `npm run dev`.
- [ ] **Step 2: Check the behaviours the documentation left open,** and note each result in the pull request:
  - The Data page reports "Storage is protected from eviction." If it reports best-effort with `unlimitedStorage` granted, raise it before relying on the tool.
  - Clicking the toolbar button a second time focuses the existing dashboard tab.
  - Export opens a save dialog and the download finishes with the strict CSP in a production build (`npm run build`, loaded through `about:debugging`).
  - The pre-restore copy lands in `Downloads/Countersign/` without a dialog. Repeat with Firefox's "Always ask you where to save files" turned on and note what happens.
  - What Firefox shows for `unlimitedStorage` when the signed build is installed.
- [ ] **Step 3: Take the screenshot** from demo data and add `docs/screenshots/applications.png`.
- [ ] **Step 4: Sign and install** following `docs/RELEASING.md`. Note whether Mozilla asked for source code or metadata, and update `docs/RELEASING.md` if so.
- [ ] **Step 5: Enter real applications,** then export once and keep the file outside the repository.
- [ ] **Step 6: Tag `v0.1.0`** after pull request 4 merges.

---

# Stage 2: save job, backup, "what I told them", contacts

Tasks are listed with their files, the functions they produce and the tests that prove them. Before stage 2 starts, each task gets its steps written out in the same form as stage 1, in a short plan update, because a few weeks of real use will change details. A task that lists more than three files or more than one test file is split at that point. Rules that hold for every task below: the Global Constraints, the conventions, the 80-call hard stop, and `reviewer-risk` for S2-1, S2-3, S2-5 and S2-6.

S2-1 to S2-5 (pull request 1) are written out in full in `docs/superpowers/plans/2026-11-15-countersign-stage2-pr1.md`.

S2-6 (pull request 2) is written out in full in `docs/superpowers/plans/2026-11-15-countersign-stage2-pr2.md`.

S2-7 to S2-10 (pull request 3) are written out in full in `docs/superpowers/plans/2026-11-15-countersign-stage2-pr3.md`.

| # | Task | Model | Files | Produces and tests |
|---|---|---|---|---|
| S2-1 | Schema 2 | sonnet | `core/src/types.ts`, `schema.ts`, `migrations.ts`, `core/src/migrations.test.ts`, `shell/storage/idb-repository.test.ts` | Stores `jobs`, `statements`, `contacts`, `contactEvents`, `tasks`, `profileFields` with `since: 2`; `SCHEMA_VERSION = 2`; migration to 2. Tests: the schema 1 fixture parses at schema 2 with the new stores empty and old records unchanged; an IndexedDB database created at version 1 with records opens at version 2 with records intact and the new stores present. Add `core/fixtures/v2-export.fixture.json` at the end of the stage. |
| S2-2 | Canonical URL | haiku | `core/src/url.ts` and test | `canonicalizeUrl(url: string, relCanonical?: string): string`. Removes the fragment and tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`, `mc_cid`, `mc_eid`, `gh_src`, `lever-source`, `source`, `src`, `ref`, `refId`, `trk`, `trackingId`); prefers a valid absolute or relative `rel=canonical`; returns the input for text that is not a URL. Tests for each rule, plus parameter order kept and `gh_jid` kept. |
| S2-3 | Capture extraction | sonnet | `shell/capture/extract.ts`, `shell/capture/fixtures/*.html` (7 files), test; add `happy-dom@21.0.4` | `extractPosting(doc: Document, selection: string): CaptureResult` with `source: 'jsonld' \| 'selection' \| 'none'`. Fixtures: JSON-LD present; JSON-LD inside `@graph`; an array of JSON-LD blocks with one `JobPosting`; malformed JSON-LD; no JSON-LD with a selection; no JSON-LD and no selection; `rel=canonical` relative and absolute. Tests: HTML in `description` becomes text; a malformed block never throws. |
| S2-4 | Duplicate and repost checks | sonnet | `core/src/duplicates.ts` and test | `findApplicationMatch(data, candidate): { kind: 'already_applied' \| 'possible_match'; applicationId } \| undefined` (same canonical URL; else same company and title after normalising); `repostFact(data, candidate, today): { firstSavedOn: LocalDate; text: string } \| undefined`, with text like "You saved this posting on 12 June (5 months ago)." Facts only. |
| S2-5 | Popup and save flow | sonnet | `entrypoints/popup/`, `entrypoints/capture.ts`, `shell/capture/inject.ts`, `core/src/job-ops.ts` and test, `wxt.config.ts` | Adds `activeTab` and `scripting`, and `commands._execute_action` with `Alt+Shift+S`. The popup captures on open (JSON-LD, then selection, then a paste box), saves with one click, shows match and repost facts, and offers "Create application" and "Open dashboard". Pages that refuse injection fall back to the paste box. A `BroadcastChannel` tells an open dashboard to reload. `saveJobOps` is tested in `core/`. Hand checks: the hotkey opens the popup and capture works through it (the documentation does not confirm `activeTab` for `_execute_action`); a PDF tab and an `about:` page fall back; the manifest still has no `content_scripts`. |
| S2-6 | Automatic backup | sonnet | `core/src/backup.ts` and test, `shell/backup.ts`, `shell/storage/idb-repository.ts`, `entrypoints/background.ts`, dashboard banner | Adds `alarms`. `backupDue(state: { lastBackupAt?: IsoInstant; writesSince: number }, now: IsoInstant): boolean` is true after 7 days or 25 writes. The repository takes an `onWrite` hook that increments a counter in `storage.local`. The event page checks `backupDue` on startup, on a daily alarm that it re-creates every session, and when the counter changes; it writes `Countersign/countersign-backup.json` with `conflictAction: 'overwrite'`. The dashboard shows "last backup N days ago" and warns past 14. Hand checks: the file is overwritten, not numbered; no dialog appears; behaviour with "Always ask you where to save files" on. |
| S2-7 | Statements and mismatch rules | sonnet | `core/src/statements.ts`, `core/src/mismatch.ts` and tests | `newStatement(answer, deps)` pre-filled from the canonical value; `checkStatement(statement, answer): 'ok' \| 'mismatch' \| 'compare' \| 'exception'`. One test per type: yes/no and choice differ; money figure below the minimum, above the maximum, and with one bound missing; date earlier than the canonical date; free text gives `compare`; a deliberate exception gives `exception`. `resolveByUpdatingCanonical` and `resolveAsException` return operations. |
| S2-8 | "What I told them" on the application | sonnet | `shell/ui/StatementsSection.tsx`, `ApplicationDetail.tsx` | Entries listed and edited on the application; a warning with its two actions; warnings never block saving. |
| S2-9 | Settings and the quiet list | sonnet | `core/src/quiet.ts` and test, `shell/ui/SettingsPage.tsx`, `shell/ui/QuietList.tsx` | `Settings.noResponseDays` (default 30) and editable status labels. `quietApplications(data, cutoffDays, today): ApplicationRow[]`: current status is Applied and its date is more than the cut-off ago. Tests: the boundary day, a later event resets it, voided events ignored. Close as No response one at a time or selected together; nothing closes by itself. |
| S2-10 | Formhand log | haiku | `core/src/types.ts`, `ApplicationDetail.tsx` | `siteType` and `fillOutcome` with a note, as optional fields and plain selects. |
| S2-11 | Contacts and "anyone here?" | sonnet | `core/src/contacts.ts` and test, `shell/ui/ContactsPage.tsx`, popup and application form | Contacts per company; `anyoneHerePrompt(data, companyId): 'show_contacts' \| 'ask' \| 'none'`; the "checked, nobody" answer is stored on the company and asked once. |
| S2-12 | Deadlines view | sonnet | `core/src/deadlines.ts` and test, `shell/ui/DeadlinesPage.tsx` | `deadlines(data, settings, today): DeadlineRow[]` from next-action dates, the quiet list and stored tasks, sorted by date, each with who acts next. Task create, complete and delete. |
| S2-13 | Copy panel | sonnet | `core/src/profile.ts` and test, `shell/ui/CopyPanel.tsx` | Profile fields (name, email, phone, address parts, links) and canonical answers, each with a copy button that writes to the clipboard on click. |
| S2-14 | Stage 2 docs and release | sonnet, then owner | `README.md`, `docs/ARCHITECTURE.md`, `core/src/demo.ts` | Demo data covers the new records; README and architecture notes updated; version `0.2.0`; owner signs and installs. |

Pull requests: (1) S2-1 to S2-5; (2) S2-6; (3) S2-7 to S2-10; (4) S2-11 to S2-14.

# Stage 3: follow-ups, interview pack, stories, weekly review

Same rules as stage 2: steps are written out before the stage starts. `reviewer-risk` for S3-1.

| # | Task | Model | Files | Produces and tests |
|---|---|---|---|---|
| S3-1 | Schema 3 | sonnet | `core/src/types.ts`, `schema.ts`, `migrations.ts`, tests | Stores `rounds`, `stories`, `weeklyReviews` with `since: 3`; migration to 3. Tests: the schema 1 and schema 2 fixtures both parse at schema 3; an IndexedDB database at version 2 opens at version 3 intact. |
| S3-2 | Follow-up tracking | sonnet | `core/src/followups.ts` and test, contact UI | Contact events (reached out, replied, referred, followed up, call held), optionally linked to an application. `followUpsUsed(data, contactId, applicationId): number`; no further follow-up date is offered after the second. Follow-up dates feed `deadlines`. Tests: the limit is per contact and per application; unlinked events do not count against an application. |
| S3-3 | Rounds and debriefs | sonnet | `core/src/rounds.ts` and test, `shell/ui/RoundsSection.tsx` | Round records (date, type, interviewers as contacts, notes) with a debrief (asked, went well, to change, stories used). Round dates feed `deadlines`. |
| S3-4 | Interview pack | sonnet | `core/src/pack.ts` and test, `shell/ui/PackPage.tsx`, print stylesheet | `interviewPack(data, applicationId)` gathers the posting, documents, projects shown, statements with unresolved warnings, contacts, rounds and debriefs. Test: an application with nothing attached still gives a pack. Print layout checked by hand. |
| S3-5 | Story bank | sonnet | `core/src/stories.ts` and test, `shell/ui/StoriesPage.tsx` | Story records (title, situation, task, action, result, tags); `storiesByTag(data, tag)`; tag search is case-insensitive. |
| S3-6 | Weekly review | sonnet | `core/src/weekly.ts` and test, `shell/ui/WeeklyPage.tsx` | `weekStart(day: LocalDate): LocalDate` (Monday); `weeklyCounts(data, weekStart)` gives outreach, conversations, applications and follow-ups, computed from events; `furthestStage(events, applicationId)`. Tests: Sunday belongs to the week that began the Monday before; a year boundary; voided events are not counted. Plan with an outreach target and an optional cap that shows a note when exceeded. Totals and the furthest-stage line are hidden until asked for. No rejection tallies, no streaks. |
| S3-7 | Target companies | haiku | `core/src/targets.ts` and test, `shell/ui/TargetsPage.tsx` | `Company.isTarget`; a view of flagged companies with their contacts and saved jobs. |
| S3-8 | Stage 3 docs and release | sonnet, then owner | `README.md`, `docs/ARCHITECTURE.md`, `core/src/demo.ts` | Demo data and docs updated; version `1.0.0`; owner signs and installs; the week-6 check-in from spec section 12 is held. |

Pull requests: (1) S3-1 to S3-4; (2) S3-5 to S3-8.

## Spec coverage

| Spec section | Where |
|---|---|
| 5 Architecture, permissions, CSP, identity | Tasks 1, 2, 12, 13; S2-5, S2-6 |
| 6.1 Locked answers and "what I told them" | Tasks 9, 17; S2-7, S2-8 |
| 6.2 Tracker | Tasks 6, 7, 8, 10, 15, 16; S2-9, S2-10 |
| 6.3 Save job | S2-2 to S2-5 |
| 6.4 Contacts and follow-ups | S2-11; S3-2 |
| 6.5 Interview pack | S3-3, S3-4 |
| 6.6 Story bank | S3-5 |
| 6.7 Deadlines | S2-12; S3-2, S3-3 |
| 6.8 Weekly review | S3-6 |
| 6.9 Target companies | S3-7 |
| 6.10 Copy panel | S2-13 |
| 6.11 Export, restore, backup | Tasks 11, 13, 18; S2-6 |
| 8 Data model | Task 4; S2-1; S3-1 |
| 9 Testing and the gate | Tasks 1, 2, 3; fixtures in S2-3 |
| 10 Repository hygiene | Tasks 3, 19 |
| Signing | Tasks 19, 20 |
