# Architecture

Countersign is a Manifest V3 Firefox extension built with WXT and Preact. It stores everything in IndexedDB on your machine.

## The core and the shell

- `core/` holds the rules: types, status logic, dates, application operations, list filtering, answers, documents, export, validation and migrations. It is plain TypeScript.
- `shell/` and `entrypoints/` hold everything that touches the browser: IndexedDB, `storage.local`, file saving, the Preact UI and the toolbar button.

The split is enforced three ways:

- `core/tsconfig.json` has no DOM library, so touching the DOM fails the typecheck.
- A lint rule in `eslint.config.js` (`no-restricted-imports`) bans `wxt`, `preact`, `idb`, `shell/` and `entrypoints/` imports in `core/`. `no-restricted-globals` bans `browser`, `window`, `document`, `indexedDB` and similar.
- Tests for these rules are in `guard/source-rules.test.ts`.

This is the same guarantee as a separate package, with less tooling. `core/` is not an npm workspace.

## Data flow: snapshots and operations

The repository interface (`core/src/repository.ts`) has three methods:

- `snapshot()` returns every record of every store, as copies.
- `apply(ops)` writes a list of `put` and `delete` operations, all or nothing.
- `replaceAll(data)` replaces everything, all or nothing. Only restore uses it.

To change data, a function in `core/` takes a snapshot and returns a list of operations. It does not write anything itself. The shell applies the list. Views filter the snapshot in memory; the data set is hundreds of records, so there are no secondary indexes.

Two details in the shell:

- Writes are serialised and each is built from a fresh snapshot (`shell/ui/write-queue.ts`). Two quick clicks cannot overwrite each other with stale data.
- Other open dashboard tabs reload after a write or restore, through a `BroadcastChannel` (`shell/ui/app-data.tsx`).

An in-memory repository (`core/src/memory-repository.ts`) is used in tests. The IndexedDB one is `shell/storage/idb-repository.ts`.

## Record types

`core/src/types.ts` defines the record types. Stage 1 has company, application, status event, document and canonical answer. Stage 2 adds job, statement ("what I told them"), contact, contact event, task and profile field. The stage 2 stores are `jobs`, `statements`, `contacts`, `contactEvents`, `tasks` and `profileFields`. Stage 3 adds round, story and weekly review. The stage 3 stores are `rounds`, `stories` and `weeklyReviews`.

- A round (`Round`) belongs to an application and holds a kind, date, time, interviewer ids and four flat debrief fields. A story (`Story`) holds situation, task, action, result and tags. A weekly review (`WeeklyReview`) holds a week start, an outreach target and an application cap.
- New optional fields: `Company.isTarget`, `Application.projectsShown`, `Contact.followUpOn`, `Contact.followUpApplicationId` and `ContactEvent.voidedAt`. A contact event is undone by setting `voidedAt`; voided events are hidden and never counted.
- Weekly counts (`core/src/weekly.ts`) are derived on read from live contact events and status events whose date falls in Monday to Sunday. Nothing is stored except the plan.

- `Company.anyoneHere` is `'checked_nobody'` when you have recorded that nobody you know works there. Contacts are otherwise linked by `companyId`.
- The deadlines list (`core/src/deadlines.ts`) is derived on read from open tasks, application next-action dates and quiet applications. It has no store of its own.
- The copy buttons call `copyText` in `shell/clipboard.ts`, which wraps `navigator.clipboard.writeText` and is only called from a click.

- Only `id` and `createdAt` are required on any record. Everything else is optional.
- Reason: records come from hand entry and from restored files. Every function that reads records must tolerate missing fields, links to records that no longer exist and status keys this build does not know. A restore of your own file must always work, and the list must never break on one odd record.
- A document record holds a file name and a SHA-256 hash, not the file.
- A canonical answer keeps its earlier values in `history`.

## Schema versions and migrations

- `SCHEMA_VERSION` is 3 (`core/src/schema.ts`). Each store records the schema it first appeared in.
- Export files carry `app: "countersign"` and `schemaVersion`. A file from a newer version is rejected, not guessed at.
- `core/src/migrations.ts` holds forward-only migrations, each lifting a file from schema `n - 1` to `n`. The migration from 1 to 2 sets the version, and the stage 2 stores are empty in an older file. The migration from 2 to 3 also only sets the version, because the stage 3 stores and fields read as empty when missing. A schema 3 export cannot be opened by 0.2.0.
- Stores are created per stage (schema 1 in stage 1, 2 in stage 2, 3 in stage 3). Every stage therefore ships a real migration with a test before a risky one is needed.
- Restore validation is structural: envelope, version, arrays, `id` and `createdAt`. Restore saves a pre-restore copy of existing data first, and if that save fails the restore stops before replacing anything.

## The privacy guard

Three parts keep "no network, nothing reads a page until you click" true. The local automatic backup check is the one thing that runs without a click.

1. **Lint rules** (`eslint.config.js`) ban network APIs in source and ban `downloads` outside `shell/files/download.ts`.
2. **Built-output scan** (`guard/scan.ts`, run by `guard/build.test.ts`) looks for network tokens in every built `.js` and `.html` file. A small allowlist (`guard/allowlist.json`) explains known harmless matches, and a test fails if an entry goes stale.
3. **Manifest and CSP checks** (`guard/build.test.ts`) assert that permissions stay within a short allowlist, no host access, no content scripts, no remote resources in built pages, and the exact Content Security Policy from `wxt.config.ts`.

## Look and feel

The theme is a ledger and card catalogue on a desk, with light and dark versions that follow the system.

- `shell/ui/theme/` holds the shared styling: `tokens.css` (every colour, size and font token), `fonts.css`, `base.css`, `layout.css` (dashboard page layout), `popup-layout.css` and `print.css` (the interview pack).
- `shell/ui/components/` holds the small component layer (`IndexCard`, `LedgerSheet`, `Field`, `Button`, `Stamp` and others). Each is a `.tsx` file with its own `.css` file, and component rules are scoped to `cs-` classes. Page layout (filters, tables, forms) lives in `theme/layout.css`, which keeps its older class names, so pages carry no CSS of their own.
- **Token rule:** every colour is a token in `tokens.css`, with day values in one `:root` block and night overrides in one `prefers-color-scheme: dark` block. No colour literal appears anywhere else. Text colour pairs are checked for WCAG AA contrast in both themes by `shell/ui/theme/contrast.test.ts`.
- **Three guards keep the look safe:**
  1. `shell/ui/theme/css-rules.test.ts` scans every CSS file under `shell/ui/` for colour literals, widths above 21rem or in `vw` in components, and animation or transition outside `prefers-reduced-motion: no-preference`.
  2. `eslint.config.js` and `guard/source-rules.test.ts` reject `style` props and inline styles, which the CSP would block at runtime.
  3. `guard/build.test.ts` checks that the built CSS references only local assets, that the three font families ship, and that pages load nothing remote.
- `public/theme/` holds the font files and the paper grain image. They are local files, so nothing loads from the network.

## Decisions made in this plan

1. **`core/` is a folder, not a workspace.** Its tsconfig has no DOM library and a lint rule bans the imports. Same guarantee, less tooling.
2. **Three repository methods** (`snapshot`, `apply`, `replaceAll`). The data set is small, so views filter in memory.
3. **Stores are created per stage,** so every stage ships a tested migration before a risky one is needed.
4. **An application has its own editable `title` and `url`.** The immutable Job capture arrives in stage 2.
5. **Archived is derived.** An application is archived when its current status is Accepted, Rejected, Position closed, No response or Withdrawn, so there is no flag to get out of step.
6. **A status event has `occurredOn` and `voidedAt`.** Old applications can be entered with real dates, and a mis-click can be undone without deleting history.
7. **The CSP is stricter than the spec.** `default-src 'self'` is added because `connect-src 'none'` alone does not stop a remote image, font or stylesheet.
8. **Restore validation is structural.** Dangling links are tolerated so you can always restore your own file.
9. **The export file includes settings,** so a restore brings back your status labels.
10. **The weekly backup is a due-check, not a seven-day alarm** (stage 2), because alarms do not survive a browser restart.
