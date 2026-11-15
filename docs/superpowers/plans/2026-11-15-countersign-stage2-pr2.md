# Countersign Stage 2, Pull Request 2: Automatic Backup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Countersign saves `Countersign/countersign-backup.json` in the downloads folder by itself, after 25 writes or 7 days, and the dashboard says how old that backup is and warns past 14 days.

**Architecture:** The rules are pure functions in `core/src/backup.ts`: when a backup is due, how a write is counted, and what the status line says. The repository calls an `onWrite` hook once per committed batch. The dashboard and popup wire that hook to a counter in `storage.local`, inside the write lock they already hold. The event page wakes on startup, on a daily alarm and on a counter change. It runs `runBackupCheck`, which snapshots under the write lock, downloads without holding it, then subtracts what it saved from the counter.

**Tech Stack:** Same as the v1 plan. No new dependency. New permission: `alarms`.

**Spec:** `docs/superpowers/specs/2026-11-13-countersign-design.md`, section 6.11 and the event page (section 5). **Parent plan:** `docs/superpowers/plans/2026-11-14-countersign-v1.md`. Its header binds every task here. This file expands that plan's S2-6.

## Global Constraints

All of the parent plan's Global Constraints apply, unchanged. These are the ones this pull request leans on most:

- The background context is an event page and holds no state in memory. Everything it needs is read from `storage.local` or IndexedDB on each wake.
- Permissions after this pull request: `unlimitedStorage`, `storage`, `downloads`, `activeTab`, `scripting`, `alarms`. That is the full ceiling.
- `core/` sees no DOM and no `browser.*`.
- Every save goes through `shell/files/download.ts`; the `downloads` lint rule is not loosened.
- Only `id` and `createdAt` are required on a record, and the stored backup state may be missing or malformed: readers never throw on it.
- Fixture file names must not contain `backup` when they end in `.json` (`.gitignore` has `*backup*.json`). Checked: none of this plan's new `.ts` files is ignored.
- Commits carry no AI attribution. Never `git add` `docs/superpowers/prompts/` or `.superpowers/`.

## Review Focus

1. **The backup keeps failing.** A cancelled "Save as" dialog, a full disk or a removed folder must not raise a new download on every later write. Expected: one attempt, then no retry for 24 hours, and the dashboard says it failed. Tests: Task 1 (`backupDue` false within 24 h of a failed attempt) and Task 4 (a rejected save, then a second check saves nothing).
2. **Writes during a backup.** A save in the popup while the event page downloads must still count toward the next backup. Test: Task 4 (the fake saver records 2 writes mid-download; the counter ends at 2).
3. **The daily alarm is pushed back forever.** The event page wakes on every write. If each wake re-created the alarm, its 24-hour timer would restart each time and never fire. Test: Task 4 (`ensureBackupAlarm` creates the alarm only when `get` returns nothing).
4. **Malformed backup state.** A missing key, a string count, a negative count or an unparsable date in `storage.local` must read as a sane state. Test: Task 1 (`readBackupState`).
5. **Counting fails after the data is stored.** A `storage.local` failure in the hook must not report a committed write as failed. Test: Task 2 (a rejecting hook; `apply` resolves and the record is stored).

## Upstream findings for this pull request

| Question | Finding | Confidence |
|---|---|---|
| Alarms across restarts | "Alarms do not persist across browser sessions." `alarms.create` with an existing name replaces that alarm, which restarts its timer. | MDN `alarms`, `alarms.create`. Verified in the parent plan; Task 4 guards the replace case. |
| Event page lifetime during a download | Firefox stops an idle event page. The docs read do not say whether a pending `downloads.download` or an unsettled `onChanged` wait keeps it alive. If the page stops, its blob URL dies with it and the download is interrupted. | **Unverified.** Design makes it safe (below); hand check. |
| `storage.onChanged` waking an event page | Not confirmed for Firefox MV3 event pages in the docs read. | **Unverified.** The daily alarm caps the delay at one day; hand check. |
| `conflictAction: 'overwrite'` in Firefox | Not covered by the docs read. | Hand check. |
| `saveAs: false` with "Always ask you where to save files" on | Not covered by the docs read. | Hand check. A dialog the user cancels becomes a recorded failure (Review Focus 1). |
| Web Locks in the event page | The event page is a window context; Firefox has `navigator.locks` (Firefox 96+). | Verified for windows; the write queue already depends on it. |

## Decisions made in this plan

1. **Backup state lives in one `storage.local` key, `backupState`:**
   `{ writesSince: number; countingSince?: IsoInstant; lastBackupAt?: IsoInstant; lastAttemptAt?: IsoInstant; lastFailure?: { at: IsoInstant; message: string } }`.
   It is not in `Settings`, so it is not exported and a restore does not bring an old backup date back.
2. **The counter is incremented inside the write lock.** The repository calls `onWrite` after its transaction commits. `apply` is only ever reached through the write queue, which holds the Web Lock `countersign-write`, so read-increment-write on `storage.local` cannot lose an update between the popup and the dashboard.
3. **One batch is one write.** `apply` with at least one op counts 1. An empty batch, a rejected batch and an aborted transaction count 0.
4. **A restore (`replaceAll`) counts as one write.** No special case. The pre-restore safety copy already protects the data that was replaced. Restore's file name is `Countersign/countersign-export-pre-restore-<stamp>.json`, which can never equal `countersign-backup.json` (test in Task 1).
5. **A failure in the hook is logged, not thrown.** The data is already committed; the 7-day rule still catches a missed count.
6. **Due rule.** In order:
   - `now` unparsable: not due.
   - **Back-off:** an attempt in the last 24 hours with no successful backup at or after it: not due. This also stops a second context starting the same backup.
   - `writesSince >= 25`: due.
   - Otherwise due when 7 × 24 hours have passed since `lastBackupAt`, or since `countingSince` if there has never been a backup. Neither present: not due, so a fresh install with no writes never downloads.
   - The 7-day rule does not require new writes, as the spec says "weekly".
7. **The 7-day clock starts at the first counted write** (`countingSince`). An existing install starts counting at its first write after this update.
8. **The backup runs in three steps:**
   1. Under the write lock: read the state, check `backupDue`, take the snapshot and settings, note `counted = writesSince`, and record `lastAttemptAt`.
   2. Without the lock: download, raced against a 60-second timeout. The lock is not held across the download, so a stalled download never blocks a save.
   3. Under the write lock again: on success, `writesSince = max(0, current - counted)`, `lastBackupAt` = the attempt time, `lastFailure` cleared. On failure, `lastFailure` is set and the counter is untouched.
9. **Two wakes never run two backups.** The whole check runs under a second Web Lock, `countersign-backup`, requested with `ifAvailable: true`. A wake that finds it held returns `busy`. Across contexts, the back-off rule (decision 6) covers the rest.
10. **Event-page lifetime.** If Firefox stops the page mid-download, step 3 never runs: the counter is kept, `lastAttemptAt` is set, and the back-off makes the next try happen within a day. The blob URL dies with the page, so nothing leaks. The hand check measures whether this happens at all.
11. **The alarm.** `countersign-backup-check`, `periodInMinutes: 1440`, `delayInMinutes: 1`. It is created only when `alarms.get` finds none, on every wake. A wake that found it missing is a new session, so it is re-created after a restart.
12. **`FileSaver.save` gains an optional `conflictAction`.** Default `'uniquify'`, so export and restore are unchanged. Only `download.ts` calls `downloads`, so no lint allowlist changes.
13. **`withWriteLock` is exported from `shell/ui/write-queue.ts`** (today's private `withLock`, renamed), so the event page takes the same lock as the queue.
14. **The dashboard shows a status line under the navigation on every page:**
    - "Last automatic backup: today." / "yesterday." / "N days ago."
    - "No automatic backup yet."
    - A warning class when more than 14 whole days have passed since the last backup, or since counting began with no backup, or when the last attempt failed after the last success. The failure line includes the error message.
    - Days are whole 24-hour periods from instants, not calendar days, so the rule is timezone-free.

## File structure (new and changed)

```
core/src/backup.ts               BackupState, readBackupState, countWrite, backupDue, startAttempt, afterBackup, afterFailure, backupStatus, constants
shell/storage/idb-repository.ts  onWrite option
shell/storage/backup-state.ts    loadBackupState, saveBackupState, recordWrite, onBackupStateChanged
shell/ui/app-data.tsx            wires onWrite to recordWrite
shell/files/download.ts          conflictAction option
shell/ui/write-queue.ts          export withWriteLock
shell/backup.ts                  runBackupCheck, ensureBackupAlarm, browserBackupDeps
entrypoints/background.ts        listeners
wxt.config.ts, guard/build.test.ts  alarms
shell/ui/BackupStatus.tsx, shell/ui/App.tsx, shell/ui/styles.css  status line
```

## Pull request

Branch `feat/stage2-backup`, Tasks 1 to 6. Hand checks are listed in Task 6.

---

## Task 1: Backup rules (S2-6a)

**Model:** sonnet (8 small functions with exact rules; more than a haiku task should carry). **Review:** reviewer-logic.

**Files:**
- Create: `core/src/backup.ts`
- Test: `core/src/backup.test.ts`

**Interfaces:**
- Consumes `IsoInstant` from `core/src/types.ts` and `exportFileName` from `core/src/export.ts` (test only).
- Produces:
  ```ts
  export const BACKUP_PATH = 'Countersign/countersign-backup.json';
  export const BACKUP_EVERY_WRITES = 25;
  export const BACKUP_EVERY_DAYS = 7;
  export const BACKUP_WARN_DAYS = 14;
  export const BACKUP_RETRY_HOURS = 24;
  export interface BackupState { writesSince: number; countingSince?: IsoInstant; lastBackupAt?: IsoInstant; lastAttemptAt?: IsoInstant; lastFailure?: { at: IsoInstant; message: string }; }
  export function readBackupState(raw: unknown): BackupState;
  export function countWrite(state: BackupState, now: IsoInstant): BackupState;
  export function backupDue(state: BackupState, now: IsoInstant): boolean;
  export function startAttempt(state: BackupState, at: IsoInstant): BackupState;
  export function afterBackup(state: BackupState, counted: number, at: IsoInstant): BackupState;
  export function afterFailure(state: BackupState, at: IsoInstant, message: string): BackupState;
  export interface BackupStatus { text: string; warn: boolean; failure?: string; }
  export function backupStatus(state: BackupState, now: IsoInstant): BackupStatus;
  ```
- **Rules:**
  - An instant is valid when it is a string and `Date.parse` gives a finite number. Compare instants by `Date.parse`, never as strings.
  - `readBackupState`: a non-object (or array) gives `{ writesSince: 0 }`. `writesSince` is kept only if it is a finite number `>= 0`, floored; otherwise `0`. Each instant field is kept only if valid. `lastFailure` is kept only if `at` is valid and `message` is a string. Unknown keys are dropped.
  - `countWrite`: `writesSince + 1`; `countingSince` set to `now` only if absent.
  - `backupDue`: decision 6, in that order.
  - `startAttempt`: sets `lastAttemptAt`.
  - `afterBackup`: `writesSince = Math.max(0, writesSince - counted)`, `lastBackupAt = at`, `lastFailure` removed; other fields kept.
  - `afterFailure`: sets `lastFailure = { at, message }`; the counter is untouched.
  - `backupStatus`: decision 14. `days = Math.floor((now - last) / 86_400_000)`, clamped at 0. `warn` is `days > 14` or a failure is shown. `failure` is `lastFailure.message` when `lastFailure.at` is after `lastBackupAt` (or there is no `lastBackupAt`).
  - Every function returns a new object and never throws.

- [ ] **Step 1: Write the failing tests.** Use instants at `T12:00:00.000Z`; `const H = 3_600_000`.
  - **readBackupState:** `undefined`, `null`, `'x'` and `[]` give `{ writesSince: 0 }`; `{ writesSince: '3' }` and `{ writesSince: -1 }` and `{ writesSince: NaN }` give `0`; `{ writesSince: 2.7 }` gives `2`; `lastBackupAt: 'not a date'` is dropped; `lastFailure: { at: valid, message: 5 }` is dropped; an unknown key is dropped.
  - **countWrite:** from `{ writesSince: 0 }` sets `countingSince = now`; a second call keeps the first `countingSince` and gives `2`.
  - **backupDue:**
    - nothing ever written: `{ writesSince: 0 }` is not due, even a year later;
    - `writesSince: 24` with a backup 1 day ago is not due; `25` is due;
    - 7 days minus 1 ms after `lastBackupAt` is not due; exactly 7 days is due;
    - no backup, `countingSince` 7 days ago, `writesSince: 1`: due;
    - `lastBackupAt` in the future: not due by time;
    - back-off: `writesSince: 30`, `lastAttemptAt` 23 h ago and no later backup: not due; at 24 h: due; `lastAttemptAt` equal to `lastBackupAt` (a success): due on 25 writes as normal;
    - `now = 'garbage'`: not due.
  - **afterBackup:** `{ writesSince: 27 }` with `counted: 25` gives `2`; `counted` larger than the count gives `0`; `lastFailure` is removed.
  - **afterFailure:** keeps `writesSince`, sets `lastFailure`.
  - **backupStatus:**
    - no backup and no counting: `'No automatic backup yet.'`, no warning;
    - no backup, counting 15 days ago: `'No automatic backup yet.'`, warning;
    - backup 2 h ago: `'Last automatic backup: today.'`; 30 h ago: `'Last automatic backup: yesterday.'`; 14 days: `'Last automatic backup: 14 days ago.'`, no warning; 15 days: warning;
    - failure after the last backup: `failure` is the message and `warn` is true; a failure before the last backup is not shown.
  - **Restore cannot overwrite the backup:** `exportFileName('pre-restore', at)` with `'Countersign/'` in front is not `BACKUP_PATH`, for 3 sample instants, and `BACKUP_PATH` does not start with `'Countersign/countersign-export'`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/backup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `core/src/backup.ts`.
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** both files with the message `Add automatic backup rules`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 2: Repository write hook (S2-6b)

**Model:** haiku. **Review:** reviewer-risk (storage).

**Files:**
- Modify: `shell/storage/idb-repository.ts:91-169`
- Test: `shell/storage/idb-repository.test.ts`

**Interfaces:**
- Produces `openIdbRepository(options: { dbName?: string; onWrite?: () => Promise<void> } = {}): Promise<Repository>`.
- **Rules:**
  - `apply`: calls `onWrite` once, after `runWrite` resolves, and only when `ops.length > 0`. Validation failure, an empty batch or an aborted transaction: not called.
  - `replaceAll`: calls `onWrite` once after `runWrite` resolves.
  - `onWrite` is awaited, so the caller's write lock covers it.
  - If `onWrite` rejects, `console.error('Countersign: could not count a write for the backup', err)` and resolve normally.

- [ ] **Step 1: Write the failing tests** in a new `describe('onWrite')`, using `freshName()` and a `vi.fn` hook that resolves:
  - `apply` with 3 puts across 2 stores calls the hook once;
  - `apply([])` does not call it;
  - `apply` with a record missing `createdAt` rejects and does not call it;
  - `replaceAll(emptySnapshot())` calls it once;
  - a hook that rejects: `apply` resolves, the record is in `snapshot()`, and `console.error` was called (spy on it and restore it).
- [ ] **Step 2: Run** `npx vitest run --project unit shell/storage/idb-repository.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** both files with the message `Let the repository report committed writes`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 3: Write counter in storage.local (S2-6c)

**Model:** sonnet. **Review:** reviewer-risk (storage, concurrency).

**Files:**
- Create: `shell/storage/backup-state.ts`
- Modify: `shell/ui/app-data.tsx:60` (pass `onWrite`)
- Test: `shell/storage/backup-state.test.ts`

**Interfaces:**
- Consumes `BackupState`, `readBackupState`, `countWrite` (Task 1); `KeyValueArea` from `shell/storage/settings.ts`; `onWrite` (Task 2).
- Produces:
  ```ts
  export const BACKUP_STATE_KEY = 'backupState';
  export async function loadBackupState(area: KeyValueArea): Promise<BackupState>;
  export function saveBackupState(area: KeyValueArea, state: BackupState): Promise<void>;
  export async function recordWrite(area: KeyValueArea, now: IsoInstant): Promise<void>;
  export function onBackupStateChanged(listener: (state: BackupState) => void): () => void;
  ```
- `recordWrite` is `saveBackupState(area, countWrite(await loadBackupState(area), now))`. It does no locking of its own: its only caller is the repository hook, which runs inside the write lock (decision 2). Say so in a one-line comment.
- `onBackupStateChanged` adds a `browser.storage.onChanged` listener that, for area `'local'` and a change to `BACKUP_STATE_KEY`, calls `listener(readBackupState(change.newValue))`. It returns a function that removes the listener. It has no unit test (a thin browser wrapper).
- `app-data.tsx`: `openIdbRepository({ onWrite: () => recordWrite(area, deps.now()) })`. Move the `deps` and `area` lines above the `openIdbRepository` call.

- [ ] **Step 1: Write the failing tests** with an in-memory `KeyValueArea` (a `Map`):
  - an empty area loads `{ writesSince: 0 }`;
  - three `recordWrite` calls in sequence give `writesSince: 3` and keep the first `countingSince`;
  - a stored `'garbage'` value loads as `{ writesSince: 0 }` and `recordWrite` then gives `1`;
  - `recordWrite` keeps `lastBackupAt` and `lastFailure` that were already stored;
  - the stored value round-trips through `readBackupState` unchanged.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/storage/backup-state.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 3 files with the message `Count writes toward the next backup`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 4: Backup run and alarm (S2-6d)

**Model:** sonnet. **Review:** reviewer-risk (downloads, concurrency).

**Files:**
- Create: `shell/backup.ts`
- Modify: `shell/files/download.ts:6,85` (`conflictAction` option)
- Modify: `shell/ui/write-queue.ts:23-31` (export `withLock` as `withWriteLock`; update its one caller)
- Test: `shell/backup.test.ts`

Four files, one over the rule: the two modifications are one line each.

**Interfaces:**
- Consumes Task 1's functions and `BACKUP_PATH`; `loadBackupState`, `saveBackupState` (Task 3); `buildExport`; `loadSettings`; `FileSaver`; `Repository`; `Deps`.
- Produces:
  ```ts
  // download.ts
  save(path: string, text: string, options: { saveAs: boolean; conflictAction?: 'uniquify' | 'overwrite' }): Promise<void>;
  // write-queue.ts
  export function withWriteLock<T>(fn: () => Promise<T>): Promise<T>;
  // backup.ts
  export const BACKUP_ALARM = 'countersign-backup-check';
  export const BACKUP_TIMEOUT_MS = 60_000;
  export interface BackupDeps {
    repo: Pick<Repository, 'snapshot'>;
    area: KeyValueArea;
    saver: FileSaver;
    clock: Pick<Deps, 'now'>;
    withWriteLock<T>(fn: () => Promise<T>): Promise<T>;
    /** Runs fn under the lock 'countersign-backup' if it is free; resolves false without running fn if it is held. */
    tryBackupLock(fn: () => Promise<void>): Promise<boolean>;
  }
  export type BackupOutcome = 'not_due' | 'busy' | 'saved' | 'failed';
  export function runBackupCheck(deps: BackupDeps): Promise<BackupOutcome>;
  export interface AlarmApi { get(name: string): Promise<unknown>; create(name: string, info: { periodInMinutes: number; delayInMinutes: number }): void | Promise<void>; }
  export async function ensureBackupAlarm(alarms: AlarmApi): Promise<void>;
  export function browserBackupDeps(): BackupDeps;
  ```
- **`runBackupCheck`** follows decision 8 exactly, inside `tryBackupLock` (decision 9). It reads `clock.now()` once and uses it for the attempt, the file's `exportedAt` and `lastBackupAt`. The file is `JSON.stringify(buildExport(data, settings, { now: () => now }), null, 2)`, saved with `{ saveAs: false, conflictAction: 'overwrite' }`. The timeout clears its timer in `finally`, as `data-service.ts` does. A failure message is the error's `message`, or `String(err)`. Storage errors in steps 1 and 3 reject.
- **`ensureBackupAlarm`** calls `create(BACKUP_ALARM, { periodInMinutes: 1440, delayInMinutes: 1 })` only when `get(BACKUP_ALARM)` resolves to `undefined` or `null`.
- **`browserBackupDeps`** opens the repository lazily (`openIdbRepository()` with no `onWrite`: the event page never writes records), uses `browserLocalArea()`, `browserFileSaver()`, `browserDeps()`, `withWriteLock`, and `navigator.locks.request('countersign-backup', { ifAvailable: true }, …)`, where a `null` lock means busy. No unit test.
- `download.ts`: pass `conflictAction: options.conflictAction ?? 'uniquify'`.

- [ ] **Step 1: Write the failing tests** with `createMemoryRepository()`, a `Map` area, a fake saver that records its calls, `withWriteLock: (fn) => fn()`, and a `tryBackupLock` fake that can be set busy:
  - **not due:** state `{ writesSince: 3 }` with a recent backup gives `'not_due'`; the saver is not called.
  - **saves when due:** `writesSince: 25` gives `'saved'`; one save to `BACKUP_PATH` with `{ saveAs: false, conflictAction: 'overwrite' }`; `parseExport` of the text is ok and its `data` equals the snapshot; afterwards `writesSince: 0`, `lastBackupAt` and `lastAttemptAt` equal the clock, no `lastFailure`.
  - **writes during the download still count:** the fake saver calls `recordWrite(area, now)` twice before resolving; afterwards `writesSince: 2`.
  - **failure backs off:** the saver rejects with `new Error('Download failed.')`; the result is `'failed'`; `lastFailure.message === 'Download failed.'`; `writesSince` is still 25; a second `runBackupCheck` at the same clock gives `'not_due'` and the saver was called once in total.
  - **stalled download:** with fake timers, a saver that never settles gives `'failed'` after `BACKUP_TIMEOUT_MS`, with a message naming 60 seconds.
  - **busy:** `tryBackupLock` busy gives `'busy'`; the saver is not called and the state is unchanged.
  - **ensureBackupAlarm:** `get` resolving `undefined` creates once with `{ periodInMinutes: 1440, delayInMinutes: 1 }`; `get` resolving an alarm object does not call `create`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/backup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** the test, then `npx vitest run --project unit shell/ui/write-queue.test.ts`. Expected: PASS. Then `npm run gate`. Expected: exit 0, no lint change needed.
- [ ] **Step 5: Commit** the 4 files with the message `Save the automatic backup when it is due`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 5: Event page and the alarms permission (S2-6e)

**Model:** haiku. **Review:** reviewer-risk (manifest, background).

**Files:**
- Modify: `entrypoints/background.ts`
- Modify: `wxt.config.ts:11-17` (add `'alarms'`)
- Test: `guard/build.test.ts`

**Interfaces:**
- Consumes `runBackupCheck`, `ensureBackupAlarm`, `browserBackupDeps`, `BACKUP_ALARM` (Task 4) and `BACKUP_STATE_KEY` (Task 3).
- **`background.ts`.** Inside `defineBackground(() => { … })`, register every listener synchronously, before any `await`:
  - `browser.runtime.onStartup` and `browser.runtime.onInstalled`: `wake()`;
  - `browser.alarms.onAlarm`: `wake()` when `alarm.name === BACKUP_ALARM`;
  - `browser.storage.onChanged`: `wake()` when the area is `'local'` and the changes include `BACKUP_STATE_KEY`.
  - Then call `wake()` once.
  - `wake()` runs `ensureBackupAlarm(browser.alarms)`, then `runBackupCheck(browserBackupDeps())`. Any rejection is caught and logged with `console.error('Countersign: automatic backup check failed', err)`. No module-level state.
- Replace the S2-6 placeholder comment with one line saying what the event page does.

- [ ] **Step 1: Write the failing build test:** `'asks for exactly the six permissions'`: `[...(manifest.permissions ?? [])].sort()` equals `[...ALLOWED].sort()`.
- [ ] **Step 2: Run** `npm run build`, then `npx vitest run --project build`. Expected: FAIL (no `alarms`).
- [ ] **Step 3: Implement** both source files.
- [ ] **Step 4: Run** `npm run gate`. Expected: exit 0. Report the `web-ext` warning count; the budget is 2. If a new warning appears, report its code and do not suppress it.
- [ ] **Step 5: Commit** the 3 files with the message `Check for a due backup from the event page`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 6: Dashboard backup status (S2-6f)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `shell/ui/BackupStatus.tsx`
- Modify: `shell/ui/App.tsx:45-50` (render `<BackupStatus />` between `nav` and `main`)
- Modify: `shell/ui/styles.css` (`.backup-status` and `.backup-status.warn`)

**Interfaces:**
- Consumes `backupStatus` (Task 1), `loadBackupState` and `onBackupStateChanged` (Task 3), `browserLocalArea`, and `useAppData().deps.now`.
- **Behaviour:**
  - On mount, load the state; subscribe with `onBackupStateChanged`; unsubscribe on unmount.
  - Render nothing until the first load settles. A load failure renders `Could not read the backup status: <message>`.
  - Otherwise one `<p class="backup-status">` (plus `warn` when `warn`), with the status text. When there is a warning past 14 days, append ` Export from the Data page if you need a copy now.`. When `failure` is set, append ` The last attempt failed: <message>. It will try again within a day.`
  - No `style` props (CSP).
- No component test (parent plan decision 13). The rule text is tested in Task 1.

- [ ] **Step 1: Implement** the three files.
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 3: Commit** the 3 files with the message `Show the automatic backup status on the dashboard`.
- [ ] **Hand checks (owner, at review),** on the built extension (`npm run build`, loaded through `about:debugging`):
  1. Make 25 saves (for example status changes). `Countersign/countersign-backup.json` appears in the downloads folder with no dialog, and the dashboard says "today".
  2. Make 25 more. The file is replaced, not saved as `countersign-backup(1).json`. This checks `conflictAction: 'overwrite'`.
  3. Turn on "Always ask you where to save files", make 25 saves, and note whether a dialog appears. If it does, cancel it: the dashboard shows the failure, and no new dialog appears on later saves that day.
  4. With `about:debugging` showing the background page stopped, make 25 saves. The backup still appears. This checks that `storage.onChanged` wakes the event page; if it does not, it appears within a day from the alarm.
  5. Restart Firefox. `about:debugging` → Inspect the background page → `await browser.alarms.getAll()` lists `countersign-backup-check`.
  6. Restore a file from the Data page. The `countersign-export-pre-restore-…json` safety copy is a separate file; `countersign-backup.json` is untouched by it.
  7. The built manifest has the six permissions, still no `content_scripts` and no host permissions.

Hard stop at 80 tool calls: commit what is done, report what remains.
