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

`core/src/types.ts` defines five record types: company, application, status event, document and canonical answer.

- Only `id` and `createdAt` are required on any record. Everything else is optional.
- Reason: records come from hand entry and from restored files. Every function that reads records must tolerate missing fields, links to records that no longer exist and status keys this build does not know. A restore of your own file must always work, and the list must never break on one odd record.
- A document record holds a file name and a SHA-256 hash, not the file.
- A canonical answer keeps its earlier values in `history`.

## Schema versions and migrations

- `SCHEMA_VERSION` is 1 (`core/src/schema.ts`). Each store records the schema it first appeared in.
- Export files carry `app: "countersign"` and `schemaVersion`. A file from a newer version is rejected, not guessed at.
- `core/src/migrations.ts` holds forward-only migrations, each lifting a file from schema `n - 1` to `n`. The list is empty at schema 1 because there is nothing older.
- Stores are created per stage (schema 1 in stage 1, 2 in stage 2, 3 in stage 3). Every stage therefore ships a real migration with a test before a risky one is needed.
- Restore validation is structural: envelope, version, arrays, `id` and `createdAt`. Restore saves a pre-restore copy of existing data first, and if that save fails the restore stops before replacing anything.

## The privacy guard

Three parts keep "no network, nothing runs until you click" true:

1. **Lint rules** (`eslint.config.js`) ban network APIs in source and ban `downloads` outside `shell/files/download.ts`.
2. **Built-output scan** (`guard/scan.ts`, run by `guard/build.test.ts`) looks for network tokens in every built `.js` and `.html` file. A small allowlist (`guard/allowlist.json`) explains known harmless matches, and a test fails if an entry goes stale.
3. **Manifest and CSP checks** (`guard/build.test.ts`) assert that permissions stay within a short allowlist, no host access, no content scripts, no remote resources in built pages, and the exact Content Security Policy from `wxt.config.ts`.

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
