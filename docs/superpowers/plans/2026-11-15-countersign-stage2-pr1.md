# Countersign Stage 2, Pull Request 1: Schema 2 and Save Job

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a job posting from the current tab, from the toolbar button or `Alt+Shift+S`. Each save records an immutable job record, shows "already applied" and repost facts, and offers to create an application. All of it sits on a schema 2 database that upgrades schema 1 data without loss.

**Architecture:** The rules are pure functions in `core/`: canonical URL, JSON-LD reading, matching and job operations. The shell adds three pieces:
- an unlisted capture script, injected with `scripting.executeScript` only when the popup opens;
- a thin injection wrapper that validates what comes back;
- a Preact popup that reuses `AppDataProvider`, so its writes go through the same write queue, Web Lock and `BroadcastChannel` as the dashboard.

The toolbar button now opens the popup. The popup has an "Open dashboard" button.

**Tech Stack:** Same as the v1 plan. The only addition is `happy-dom` 21.0.4, a dev dependency for the extraction tests.

**Spec:** `docs/superpowers/specs/2026-11-13-countersign-design.md`, sections 5, 6.3 and 8. **Parent plan:** `docs/superpowers/plans/2026-11-14-countersign-v1.md`. Its header (Global Constraints, Decisions, Conventions) binds every task here. This file expands that plan's S2-1 to S2-5.

## Global Constraints

All of the parent plan's Global Constraints apply, unchanged. These are the ones stage 2 leans on most:

- No `content_scripts` and no host permissions, ever. Code runs on a page only after a click or the hotkey, through `scripting.executeScript`.
- Permissions after this pull request: `unlimitedStorage`, `storage`, `downloads`, `activeTab`, `scripting`. `alarms` arrives in S2-6.
- `core/` sees no DOM and no `browser.*`. Its tsconfig has `lib: ["ES2023"]` and `types: []`.
- Only `id` and `createdAt` are required on a record. Readers tolerate missing fields, odd types, dangling links and unknown keys without throwing.
- Fixtures are synthetic: invented companies and `https://example.com/` URLs. No HTML copied from a real job site.
- The posting text stored on a job is capped at `MAX_POSTING_TEXT = 100_000` characters.
- Dependencies are installed with `--save-exact`. Commits carry no AI attribution. Never `git add` `docs/superpowers/prompts/` or `.superpowers/`.

## Review Focus

1. **Hostile or broken page content.** A page with malformed JSON-LD, a huge description, script tags inside the description, or a `JobPosting` with every field the wrong type must give a capture result, never an exception, with text only and capped. Tests: Task 4 (`postingFromJsonLd` with wrong types) and Task 5 (script content stripped, cap applied).
2. **Pages that refuse injection.** On `about:` pages, the PDF viewer, `addons.mozilla.org`, or a tab closed mid-capture, the user gets the paste box and a plain line, not an error dump. Tests: Task 9 (`capturePage` maps a rejected `executeScript` to `{ ok: false, reason: 'refused' }`). Hand check in Task 11.
3. **Upgrading real schema 1 data.** An existing IndexedDB database and an old export file must keep every record, and the new stores must appear empty. Tests: Task 1 (v1 fixture parses at schema 2) and Task 2 (a version 1 database with records opens at version 2).
4. **The same posting reached two ways.** A tracking parameter, a fragment, a relative `rel=canonical`, or a company typed in a different case must still give "already applied" or the repost fact. Tests: Task 3 (each tracking rule) and Task 6 (a match through the job link, a match through the application URL, a company-name match ignoring case).
5. **The popup closes mid-flow.** A popup closes when it loses focus. A save is one `apply` transaction, so it is either fully written or not written at all. A dashboard open at the same time must show the new job or application after it reloads. Test: Task 7 (`saveJobOps` returns exactly one put). Hand check in Task 11.

## Upstream findings for this pull request

| Question | Finding | Confidence |
|---|---|---|
| `URL` inside `core/` | `core/tsconfig.json` has `lib: ["ES2023"]` and `types: []`, so `URL` is not declared there, although Node and Firefox both provide it at runtime. | Verified (read the tsconfig). Task 3 declares the subset it uses. |
| WXT popup entrypoint | `entrypoints/popup/index.html` becomes `action.default_popup`. A browser that has a popup does not fire `action.onClicked`. | WXT docs (entrypoints) and MDN (`action.onClicked`). Task 10 asserts it in the build test. |
| WXT unlisted script return value | `defineUnlistedScript(main)` is meant to make `executeScript` resolve to `main`'s return value. | **Unverified.** Task 9 Step 1 checks the built `capture.js` before any other work. |
| `activeTab` through `_execute_action` | Unverified, per the parent plan. | Hand check in Task 11. |
| `tabs.query` without the `tabs` permission | It returns the active tab. `url` is present only when `activeTab` has been granted for that tab. | MDN `tabs.Tab`. Task 9 falls back to the URL the page reports. |
| `happy-dom` 21.0.4 | Node `>=20`. It works through the per-file `// @vitest-environment happy-dom` comment. | Engines verified in the parent plan. |

## Decisions made in this plan

1. **This is a sibling plan file,** not an edit to the parent's Stage 2 table. Task briefs stay short, and the parent's numbering stays stable. The parent's Stage 2 heading gets one line pointing here.
2. **All six stage 2 stores arrive in Task 1.** Their record types are defined now, with every field optional, so later tasks only add fields; an optional field needs no migration.
3. **The migration to schema 2 changes no data.** Missing stores already read as empty. The migration exists because the chain needs a step, and it has its own test.
4. **`export.ts` builds its result and counts from `STORES`,** instead of the hard-coded literals at lines 164-177, so a later schema adds a store in one place.
5. **The toolbar button opens the popup.** `action.onClicked` stops firing, so the background listener is removed. The event page stays, empty, for S2-6.
6. **Capture writes only a job record.** A company record is created only when the user clicks "Create application" (through `newApplicationOps`), so saving a posting never adds companies.
7. **Repost and match facts are computed from the snapshot the popup rendered,** before the save, not inside the write.
8. **Lint guards for navigation and injection** close the parent plan's ruling that parked them to stage 2:
   - `window.open` and assigning to `location` (other than `location.hash`) are banned everywhere.
   - `tabs` is allowed only in `shell/open-dashboard.ts` and `shell/capture/inject.ts`.
   - `scripting` is allowed only in `shell/capture/inject.ts`.

## File structure (new and changed)

```
core/src/types.ts            + Job, Statement, Contact, ContactEvent, Task, ProfileField; Application.jobId
core/src/schema.ts           SCHEMA_VERSION 2, six stores since 2
core/src/migrations.ts       { to: 2 }
core/src/export.ts           result and counts built from STORES
core/src/url.ts              canonicalizeUrl
core/src/jobposting.ts       CaptureResult, MAX_POSTING_TEXT, postingFromJsonLd
core/src/duplicates.ts       findApplicationMatch, repostFact
core/src/job-ops.ts          saveJobOps, createApplicationFromJobOps
shell/capture/extract.ts     extractPosting(doc, selection)
shell/capture/fixtures/*.html
shell/capture/inject.ts      capturePage, toCaptureResult
entrypoints/capture.ts       unlisted script: returns extractPosting(document, selection)
entrypoints/popup/           index.html, main.tsx
shell/ui/Popup.tsx, shell/ui/popup.css
eslint.config.js, guard/source-rules.test.ts, guard/build.test.ts
```

## Pull request

Branch `feat/stage2-capture`, Tasks 1 to 11. Hand checks are listed in Task 11.

---

## Task 1: Schema 2 in core (S2-1a)

**Model:** sonnet. **Review:** reviewer-risk (schema, migration).

**Files:**
- Modify: `core/src/types.ts`, `core/src/schema.ts`, `core/src/migrations.ts`, `core/src/export.ts:164-177`
- Modify: `shell/ui/DataPage.tsx:30-36` (`STORE_LABELS` must cover every store, or the typecheck fails)
- Test: `core/src/export.test.ts`

This task touches 6 files. That is over the 3-file rule, but the edits are forced by the typecheck and are mechanical.

**Interfaces:**
- Produces, in `core/src/types.ts`. Every field is optional; `capturedAt` is the record's `createdAt`.
  ```ts
  export type CaptureSource = 'jsonld' | 'selection' | 'paste';
  export interface Job extends BaseRecord { title?: string; companyName?: string; location?: string; url?: string; canonicalUrl?: string; text?: string; source?: CaptureSource; }
  export interface Statement extends BaseRecord { applicationId?: Id; answerKey?: string; value?: AnswerValue; exception?: boolean; }
  export interface Contact extends BaseRecord { companyId?: Id; name?: string; role?: string; howKnown?: string; notes?: string; }
  export type ContactEventKind = 'reached_out' | 'replied' | 'referred' | 'followed_up' | 'call_held';
  export interface ContactEvent extends BaseRecord { contactId?: Id; applicationId?: Id; kind?: ContactEventKind; occurredOn?: LocalDate; note?: string; }
  export interface Task extends BaseRecord { title?: string; dueOn?: LocalDate; doneAt?: IsoInstant; applicationId?: Id; }
  export interface ProfileField extends BaseRecord { key?: string; label?: string; value?: string; }
  // Application gains: jobId?: Id
  ```
- `StoreMap` gains `jobs`, `statements`, `contacts`, `contactEvents`, `tasks` and `profileFields`. `SCHEMA_VERSION = 2`. `STORES` lists the six new stores, in that order, with `since: 2`. `emptySnapshot()` covers all 11 stores.
- `MIGRATIONS = [{ to: 2, migrate: (file) => ({ ...file, schemaVersion: 2 }) }]`.
- `DataPage` labels: Jobs, Statements, Contacts, Contact events, Tasks, Profile fields.

- [ ] **Step 1: Write the failing tests** in `core/src/export.test.ts`:
  - **'reads the schema 1 fixture at schema 2'.** `parseExport(fixtureText)` is ok. `file.schemaVersion === 2`. Every stage 1 store equals the fixture's arrays. Each of the six new stores is `[]`, and its count is `0`.
  - **'lifts a schema 1 file through the real migration'.** `MIGRATIONS` has one entry, with `to === 2`. Applying it to a minimal raw schema 1 file returns the same `data` object contents and `schemaVersion: 2`.
  - **'counts every store in STORES'.** For a parsed file, `Object.keys(counts).sort()` equals `STORES.map((s) => s.name).sort()`.
  - **'rejects a schema 3 file'.** It fails with the existing newer-version message, which now names schema 3.
  - Update the existing round-trip and count expectations so their literals include the new stores at `0`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/export.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the types, schema and migration above. Build `out` and `counts` in `export.ts` by iterating `STORES` (filtered by `since <= target`), not from literals. Add the `DataPage` labels.
- [ ] **Step 4: Run** the test file. Expected: PASS. Then `npm run gate`. Expected: exit 0. The `DataPage` restore summary now lists 11 stores.
- [ ] **Step 5: Commit** the 6 files with the message `Add schema 2 stores and migration`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 2: IndexedDB upgrade from version 1 (S2-1b)

**Model:** haiku. **Review:** reviewer-risk (storage).

**Files:**
- Test: `shell/storage/idb-repository.test.ts`. No source change is expected: the `upgrade` callback already creates each store whose `since` is above the old version.

**Interfaces:** Consumes `openIdbRepository`, the file's existing `rawOpen` and `freshName` helpers, and `STORES`.

- [ ] **Step 1: Write the test 'upgrades a version 1 database without losing records'.**
  1. Using `rawOpen(dbName, 1, upgrade)`, create only the stores with `since === 1`.
  2. Put one company `{ id: 'c1', createdAt: '2026-01-05T09:00:00.000Z', name: 'Example Robotics' }` and one application `{ id: 'a1', createdAt: …, companyId: 'c1' }`.
  3. Close the database.
  4. `openIdbRepository({ dbName })`, then `snapshot()`.
  5. Expect `companies` and `applications` to equal what was put, and every `since === 2` store to be `[]`.
  6. Reopen the raw database. Its `version` is `2`, and `objectStoreNames` contains every name in `STORES`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/storage/idb-repository.test.ts`. Expected: PASS. If it fails, report the failure; do not change `idb-repository.ts` without saying why.
- [ ] **Step 3: Commit** with the message `Test the IndexedDB upgrade to schema 2`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 3: Canonical URL (S2-2)

**Model:** haiku. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/url.ts`
- Test: `core/src/url.test.ts`

**Interfaces:**
- Produces `canonicalizeUrl(url: string, relCanonical?: string): string`.
- Because `core/` declares no `URL`, `url.ts` declares the subset it uses:
  ```ts
  interface UrlLike { protocol: string; hash: string; search: string; href: string; searchParams: { forEach(cb: (value: string, key: string) => void): void } }
  declare const URL: { new (url: string, base?: string): UrlLike };
  ```

**Rules, in order:**
1. If `relCanonical` is non-blank and resolves against `url` to an `http:` or `https:` URL, use it as the base result. Otherwise use `url`.
2. If the result does not parse as an `http:` or `https:` URL, return the trimmed input unchanged.
3. Remove the fragment.
4. Remove tracking parameters, comparing names case-insensitively:
   - every name starting with `utm_`;
   - `gclid`, `fbclid`, `msclkid`, `mc_cid`, `mc_eid`, `gh_src`, `lever-source`, `source`, `src`, `ref`, `refid`, `trk`, `trackingid`.
5. Keep the order of the remaining parameters. If none remain, there is no `?`.

- [ ] **Step 1: Write the failing tests.**
  - `'https://example.com/jobs/1?utm_source=x&utm_Medium=y#apply'` gives `'https://example.com/jobs/1'`.
  - Each listed name is removed. Use one `it.each` row per name.
  - `'https://example.com/jobs?b=2&gclid=z&a=1'` gives `'https://example.com/jobs?b=2&a=1'` (order kept).
  - `gh_jid` is kept: `'https://example.com/j?gh_jid=123&gh_src=abc'` gives `'https://example.com/j?gh_jid=123'`.
  - An absolute canonical: `canonicalizeUrl('https://example.com/a?ref=x', 'https://example.com/jobs/9')` gives `'https://example.com/jobs/9'`.
  - A relative canonical: `canonicalizeUrl('https://example.com/a/b?x=1', '/jobs/9#top')` gives `'https://example.com/jobs/9'`.
  - A `javascript:` or blank canonical is ignored, and the cleaned `url` is returned.
  - Not a URL: `canonicalizeUrl('  pasted text  ')` gives `'pasted text'`. `canonicalizeUrl('ftp://example.com/x')` gives `'ftp://example.com/x'`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/url.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Rebuild the query from the kept pairs with `encodeURIComponent`, so `URLSearchParams` is not needed.
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** both files with the message `Add canonical URL rules`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 4: JSON-LD posting reader (S2-3a)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/jobposting.ts`
- Test: `core/src/jobposting.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_POSTING_TEXT = 100_000;
  export interface CaptureResult { source: 'jsonld' | 'selection' | 'none'; url: string; relCanonical?: string; title?: string; companyName?: string; location?: string; text?: string; }
  export interface PostingFields { title?: string; companyName?: string; location?: string; descriptionHtml?: string; }
  export function postingFromJsonLd(blocks: readonly string[]): PostingFields | undefined;
  ```
- **Reading rules:**
  - Each block is parsed with `JSON.parse` inside try/catch. A malformed block is skipped.
  - Candidates are found in the parsed value itself, in an array of values, or in a `@graph` array, recursing at most 3 levels.
  - The first candidate whose `@type` is `'JobPosting'`, or an array containing it, wins.
  - Fields come only from strings:
    - `title`;
    - `hiringOrganization.name`, or `hiringOrganization` if it is a string;
    - `jobLocation.address.addressLocality` and `addressRegion`, joined with `', '`. `jobLocation` may be an array; take the first entry;
    - `description` becomes `descriptionHtml`.
  - Strings are trimmed. A blank string counts as absent.
  - Returns `undefined` when no `JobPosting` is found.

- [ ] **Step 1: Write the failing tests:**
  - **A plain block.** One `JobPosting` block gives all four fields.
  - **`@graph`.** The `JobPosting` sits inside `@graph` next to an `Organization`.
  - **An array.** An array of blocks with one `JobPosting` is found.
  - **A malformed block.** One malformed block followed by a valid block finds the valid one, without throwing.
  - **Wrong types.**
    - `title: 42` is absent.
    - `hiringOrganization: { name: ['x'] }` is absent.
    - `jobLocation: null` is fine.
    - Nothing throws.
  - **No `JobPosting`.** `undefined`.
  - **`@type` as an array.** `['JobPosting', 'Thing']` matches.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/jobposting.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** with the message `Read job postings from JSON-LD`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 5: Page extraction (S2-3b)

**Model:** sonnet. **Review:** reviewer-risk (new dependency; runs inside web pages).

**Files:**
- Modify: `package.json` and `package-lock.json` (`npm install --save-dev --save-exact happy-dom@21.0.4`)
- Create: `shell/capture/extract.ts`
- Create: `shell/capture/fixtures/`, 7 hand-written synthetic HTML files:
  - `jsonld.html`
  - `jsonld-graph.html`
  - `jsonld-array.html`
  - `jsonld-malformed.html`
  - `selection-only.html`
  - `nothing.html`
  - `canonical.html` (with a relative `rel=canonical`)

  Use invented companies and `https://example.com/` URLs only.
- Test: `shell/capture/extract.test.ts`, starting with the comment `// @vitest-environment happy-dom`.

**Interfaces:**
- Consumes `postingFromJsonLd`, `CaptureResult` and `MAX_POSTING_TEXT` from Task 4.
- Produces `extractPosting(doc: Document, selection: string): CaptureResult`.
- **Rules:**
  - `url` is `doc.location?.href ?? ''`.
  - `relCanonical` is the `href` attribute (not the resolved property) of the first `link[rel~="canonical"]`.
  - The blocks are the `textContent` of every `script[type="application/ld+json"]`.
  - **JSON-LD found.** `source: 'jsonld'`, with its fields. `text` is `descriptionHtml` converted to text through `new DOMParser().parseFromString(html, 'text/html').body.textContent`, with whitespace runs collapsed and trimmed. `script` and `style` elements are removed first.
  - **Otherwise, a non-blank `selection`.** `source: 'selection'`, with `text` set to the trimmed selection and `title` set to `doc.title` trimmed.
  - **Otherwise.** `source: 'none'`.
  - `text` is cut to `MAX_POSTING_TEXT`.
  - The function must not throw on any document: wrap it, and return `{ source: 'none', url }` on an internal error.
  - The page's live DOM is never modified.
- Tests load fixtures with `readFileSync` and `new Window({ url: 'https://example.com/jobs/1' })` from `happy-dom`, then `document.write(html)`.

- [ ] **Step 1: Write the failing tests:**
  - One test per fixture, asserting `source` and the key fields.
  - **'turns description HTML into text and drops scripts'.** A description `<p>Build <b>robots</b></p><script>alert(1)</script>` gives `'Build robots'`.
  - **'caps the text'.** A 150 000-character selection gives `text.length === 100_000`.
  - **'reads the canonical href as written'.** It gives `'/jobs/9'`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/capture/extract.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0, and the guard scan is still clean, because `happy-dom` is a dev dependency and is not bundled.
- [ ] **Step 5: Commit** the listed files with the message `Extract job postings from a page`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 6: Duplicate and repost checks (S2-4)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/duplicates.ts`
- Modify: `core/src/application-ops.ts:33`: export `normalizeName`, unchanged.
- Test: `core/src/duplicates.test.ts`

**Interfaces:**
- Consumes `canonicalizeUrl` (Task 3), `normalizeName`, `toLocalDate`, `isLocalDate` and `Snapshot`.
- Produces:
  ```ts
  export interface JobCandidate { canonicalUrl?: string; companyName?: string; title?: string; }
  export type ApplicationMatch = { kind: 'already_applied' | 'possible_match'; applicationId: Id };
  export function findApplicationMatch(data: Snapshot, candidate: JobCandidate): ApplicationMatch | undefined;
  export function repostFact(data: Snapshot, candidate: JobCandidate & { excludeJobId?: Id }, today: LocalDate): { firstSavedOn: LocalDate; text: string } | undefined;
  ```
- **Matching:**
  - An application's canonical URL is that of its linked job (`jobId` → `jobs[].canonicalUrl`) if present, else `canonicalizeUrl(app.url)` when `app.url` is a non-blank string.
  - **`already_applied`.** The application's canonical URL equals `candidate.canonicalUrl`. Any status counts.
  - **`possible_match`.** Otherwise, the application's company name (through `companyId`) and `title` both equal the candidate's after `normalizeName`. Both must be non-blank.
  - `already_applied` beats `possible_match`. Among equals, the latest `createdAt` wins.
- **Repost:**
  - The earliest job in `data.jobs`, other than `excludeJobId`, with the same canonical URL, or the same normalised company name and title.
  - `firstSavedOn = toLocalDate(new Date(job.createdAt))`. A job whose date does not parse is skipped.
  - Text: `You saved this posting on ${day} ${MonthName}${year === today's year ? '' : ' ' + year} (${ago}).`
  - `ago`:
    - `today` on the same day;
    - `yesterday` for one day;
    - `N days ago` for under one calendar month;
    - otherwise `1 month ago` or `N months ago`.
  - Calendar months are `(ty-fy)*12 + (tm-fm) - (td < fd ? 1 : 0)`.

- [ ] **Step 1: Write the failing tests.** Fixtures use `createdAt` instants at `T12:00:00.000Z`, so the local date matches in every CI timezone.
  - already_applied through the job link;
  - already_applied through `app.url` with a `utm_` parameter;
  - possible_match on company `'Example Robotics'` vs `' example  robotics '` and the same title under a different URL;
  - no match when only the company matches;
  - an application with no company, and a `jobId` that dangles, do not throw;
  - repost: saved `2026-06-12`, today `2026-11-15` gives `firstSavedOn: '2026-06-12'` and the text `'You saved this posting on 12 June (5 months ago).'`;
  - today `2027-01-02` vs `2026-12-20` gives `'You saved this posting on 20 December 2026 (13 days ago).'`;
  - `today` and `yesterday`;
  - `excludeJobId` is ignored;
  - no earlier job gives `undefined`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/duplicates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 3 files with the message `Add duplicate and repost checks`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 7: Job operations (S2-5a)

**Model:** haiku. **Review:** reviewer-logic.

**Files:**
- Create: `core/src/job-ops.ts`
- Test: `core/src/job-ops.test.ts`

**Interfaces:**
- Consumes `canonicalizeUrl`, `MAX_POSTING_TEXT`, `newApplicationOps(input, data, deps): { ops; applicationId }`, `Job` and `Deps`.
- Produces:
  ```ts
  export interface JobInput { source: CaptureSource; url?: string; relCanonical?: string; title?: string; companyName?: string; location?: string; text?: string; }
  export function saveJobOps(input: JobInput, deps: Deps): { ops: WriteOp[]; jobId: Id };
  export function createApplicationFromJobOps(job: Job, data: Snapshot, deps: Deps): { ops: WriteOp[]; applicationId: Id };
  ```
- **`saveJobOps`.**
  - Exactly one `put` to `jobs`, with `id: deps.newId()` and `createdAt: deps.now()`.
  - String fields are trimmed; blank becomes absent.
  - `text` is cut to `MAX_POSTING_TEXT`.
  - `canonicalUrl = canonicalizeUrl(url, relCanonical)` when `url` is non-blank.
  - `relCanonical` itself is not stored.
- **`createApplicationFromJobOps`.**
  - Calls `newApplicationOps({ companyName, title, url: job.url, status: 'interested' }, data, deps)`.
  - Sets `jobId: job.id` on the application put in those ops.

- [ ] **Step 1: Write the failing tests:**
  - one put to `jobs` with the canonical URL;
  - blanks dropped;
  - text capped;
  - `relCanonical` used for the canonical URL but not stored;
  - creating an application reuses an existing company typed in another case (no second company put), sets `jobId`, and adds an `interested` status event.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/job-ops.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** with the message `Add job save and application-from-job operations`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 8: Navigation and injection lint (S2-5b)

**Model:** sonnet. **Review:** reviewer-risk (privacy guard).

**Files:**
- Modify: `eslint.config.js`
- Test: `guard/source-rules.test.ts`

**Interfaces:**
- **Rules,** added to the existing `no-restricted-syntax` arrays:
  - **Banned everywhere,** with the message `Countersign never navigates away or opens windows.`:
    - `window.open`, and the global `open`;
    - `location.assign`, `location.replace` and `location.reload`;
    - assigning to `location`, `window.location`, `document.location` or `location.href`.
  - Assigning `location.hash` stays allowed: `shell/ui/ApplicationDetail.tsx:152` uses it.
  - **`tabs` member access** is allowed only in `shell/open-dashboard.ts` and `shell/capture/inject.ts`. Message: `Use tabs only in open-dashboard.ts or capture/inject.ts.`
  - **`scripting` member access** is allowed only in `shell/capture/inject.ts`. Message: `Inject only through shell/capture/inject.ts.`
- A later block that sets `no-restricted-syntax` replaces earlier ones. Every per-file override must spread the full set it still needs, as the `download.ts` override does today.

- [ ] **Step 1: Write the failing tests,** each an ESLint probe in the existing style:
  - each banned form is rejected in `shell/ui/x.tsx`;
  - `location.hash = '#/data'` is allowed;
  - `browser.tabs.query()` is rejected in `shell/ui/x.tsx` and allowed in both allowed files;
  - `browser.scripting.executeScript()` is rejected in `shell/open-dashboard.ts` and allowed in `shell/capture/inject.ts`;
  - the download and network rules still apply in both allowed files.
- [ ] **Step 2: Run** `npx vitest run --project unit guard/source-rules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then `npm run gate`. Expected: exit 0, with no lint error in existing code.
- [ ] **Step 5: Commit** with the message `Guard against navigation and stray tab or script access`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 9: Capture injection (S2-5c)

**Model:** sonnet. **Review:** reviewer-risk (permissions; runs inside web pages).

**Files:**
- Create: `entrypoints/capture.ts`
- Create: `shell/capture/inject.ts`
- Modify: `wxt.config.ts`: `permissions: ['unlimitedStorage', 'storage', 'downloads', 'activeTab', 'scripting']`
- Test: `shell/capture/inject.test.ts`

**Interfaces:**
- `entrypoints/capture.ts`: `export default defineUnlistedScript(() => extractPosting(document, String(window.getSelection() ?? '')));`. Import `defineUnlistedScript` from `wxt/utils/define-unlisted-script`; auto-imports are off.
- Produces, in `inject.ts`:
  ```ts
  export type CaptureOutcome = { ok: true; capture: CaptureResult } | { ok: false; reason: 'no_tab' | 'refused' };
  export function toCaptureResult(raw: unknown, tabUrl: string | undefined): CaptureResult | undefined;
  export interface CaptureApi { activeTab(): Promise<{ id?: number; url?: string } | undefined>; run(tabId: number): Promise<unknown>; }
  export async function capturePage(api: CaptureApi = browserCaptureApi): Promise<CaptureOutcome>;
  ```
- **`browserCaptureApi`** uses:
  - `browser.tabs.query({ active: true, currentWindow: true })`, taking the first tab;
  - `browser.scripting.executeScript({ target: { tabId }, files: ['/capture.js'] })`, taking `results[0]?.result`.
- **`toCaptureResult`** accepts only a plain object:
  - `source` is one of the three values, else `'none'`;
  - string fields are trimmed, and non-strings dropped;
  - `text` is cut to `MAX_POSTING_TEXT`;
  - `url` is `tabUrl` when it is a non-blank string, else the object's `url`, else `''`.
- **`capturePage` outcomes:**
  - no tab or no id gives `no_tab`;
  - `run` rejecting, or `toCaptureResult` returning `undefined`, gives `refused`.

- [ ] **Step 1: Verify the upstream finding first.**
  1. Create `entrypoints/capture.ts` and run `npm run build`.
  2. Read `.output/firefox-mv3/capture.js` and confirm that the script's final completion value is `main`'s return value.
  3. If it is not, stop and report with the file's last 20 lines. Do not invent a workaround.
- [ ] **Step 2: Write the failing tests** with a fake `CaptureApi`:
  - a good result gives `ok` with the tab URL preferred;
  - `run` rejecting gives `refused`;
  - `run` returning `undefined`, a string or an array gives `refused`;
  - no tab gives `no_tab`;
  - `toCaptureResult` drops a numeric `title`, maps `source: 'evil'` to `'none'` and caps `text`.
- [ ] **Step 3: Run** `npx vitest run --project unit shell/capture/inject.test.ts`. Expected: FAIL. **Step 4: Implement.** **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Run `npm run gate`.** Expected: exit 0. The built permissions are the five listed, `content_scripts` is still absent, and the scan is clean.
- [ ] **Step 7: Commit** the 4 files with the message `Inject the capture script on demand`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 10: Popup entry and hotkey (S2-5d)

**Model:** sonnet. **Review:** reviewer-risk (manifest).

**Files:**
- Create: `entrypoints/popup/index.html` and `entrypoints/popup/main.tsx` (placeholder)
- Modify: `wxt.config.ts`: add `commands: { _execute_action: { suggested_key: { default: 'Alt+Shift+S' } } }`
- Modify: `entrypoints/background.ts`: remove the `action.onClicked` listener, because a popup stops it from firing. Keep `defineBackground(() => {})` with a one-line comment that the event page stays for the backup check in S2-6.
- Test: `guard/build.test.ts`

**Interfaces:**
- The placeholder popup renders a heading "Countersign" and an "Open dashboard" button. The button calls `openDashboard()` from `shell/open-dashboard.ts`, then `window.close()`.
- `index.html` follows `entrypoints/dashboard/index.html`: no inline script and no remote reference.

- [ ] **Step 1: Write the failing build tests:**
  - **'opens a popup from the toolbar'.** `manifest.action.default_popup` is a string ending in `popup.html`.
  - **'binds Alt+Shift+S to the toolbar action'.** `manifest.commands._execute_action.suggested_key.default === 'Alt+Shift+S'`.
  - **'ships the capture script only as a file'.** `.output/firefox-mv3/capture.js` exists. The existing content-script and web-accessible-resource assertions stay.
- [ ] **Step 2: Run** `npm run build`, then `npx vitest run --project build`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run gate`.** Expected: exit 0. Report the web-ext warning count; the budget is 2. If a new warning appears, report its code and do not suppress it.
- [ ] **Step 5: Commit** the 5 files with the message `Open a popup from the toolbar and the hotkey`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 11: Popup save flow (S2-5e)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**
- Create: `shell/ui/Popup.tsx` and `shell/ui/popup.css`
- Modify: `entrypoints/popup/main.tsx`: render `<AppDataProvider><Popup /></AppDataProvider>`, and import `popup.css`

**Interfaces:**
- Consumes:
  - `capturePage` (Task 9);
  - `saveJobOps` and `createApplicationFromJobOps` (Task 7);
  - `findApplicationMatch` and `repostFact` (Task 6);
  - `useAppData()`: `data`, `deps`, `apply(builder)`;
  - `openDashboard`;
  - `toLocalDate`.
- **Flow:**
  1. **On mount,** call `capturePage()` once and show "Reading this page…".
  2. **If `ok` and `source !== 'none'`:** show the title, company, location and the first 300 characters of the text, all read-only, and a "Save job" button.
  3. **Otherwise,** show one line:
     - `refused` or `no_tab`: "This page can't be read. Paste the posting below.";
     - `none`: "No job posting found. Select the posting text and reopen, or paste it below.".

     Then show a textarea, plus Title and Company inputs. "Save job" is enabled when any of them is non-blank. The source is `'paste'`, and the URL is the captured one if any.
  4. **"Save job"** runs `const { ops, jobId } = saveJobOps(input, deps); await apply(ops);`. A plain array is fine here: the ops are a single insert that reads nothing from the snapshot, so they cannot go stale. Facts are computed from the rendered `data` before the save:
     - `findApplicationMatch(data, candidate)`;
     - `repostFact(data, { ...candidate, excludeJobId: jobId }, toLocalDate(new Date()))`.
  5. **After the save,** show:
     - "Saved.";
     - "Already applied here." or "Possible match: an application for the same company and title.";
     - the repost text if there is one;
     - the buttons "Create application" and "Open dashboard".

     Saving twice is impossible: the button disappears.
  6. **"Create application"** runs `apply((d) => { const job = d.jobs.find((j) => j.id === jobId); return job ? createApplicationFromJobOps(job, d, deps).ops : []; })`, then shows "Application created.".
  7. **"Open dashboard"** calls `openDashboard()`, then `window.close()`.
  8. Any failure shows its message beside the action. Nothing is swallowed.
- CSP: no `style` props. Forms call `preventDefault`. The width is set in `popup.css`, for example `min-width: 22rem`.

- [ ] **Step 1: Implement.** The popup has no component test; the parent plan's decision 13 applies.
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 3: Commit** the 3 files with the message `Save jobs from the popup`.
- [ ] **Hand checks (owner, at review),** on the built extension: run `npm run build` and load it through `about:debugging`.
  - Open a page with a `JobPosting` (any of `shell/capture/fixtures/` served locally works). Click the toolbar button. The fields appear. Save. Create an application. It appears in the dashboard.
  - Select text on a page with no JSON-LD and press `Alt+Shift+S`. The selection is captured. This checks `activeTab` through `_execute_action`.
  - Open an `about:` page and a PDF. The paste box appears. Pasting and saving works.
  - Save the same posting again. The repost fact and "Already applied here." appear.
  - With the dashboard open in a tab, save from the popup. The dashboard reloads and shows the change.
  - `about:addons` → Manage Extension Shortcuts shows `Alt+Shift+S`.
  - The built manifest still has no `content_scripts` and no host permissions.

Hard stop at 80 tool calls: commit what is done, report what remains.
