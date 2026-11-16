# Countersign Stage 2, Pull Request 3: "What I Told Them", Quiet List, Formhand Log

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what each application was told, warn when it differs from the canonical answer (never blocking), list applications quiet past a cut-off and close them as No response on request, add a settings page, and log how form filling went.

**Architecture:** The rules are pure functions in `core/`: statement operations, the mismatch check, settings normalisation, the quiet rule and the close operation. The shell adds a statements section and a Formhand log to the application page, a settings page, and a quiet-list page. Every data write goes through `app.apply` (one queue turn, one batch). Settings stay in `storage.local` and are saved through a new `AppData.saveSettings`, inside the same write lock as restore.

**Tech Stack:** Same as the v1 plan. No new dependency, permission or browser API.

**Spec:** `docs/superpowers/specs/2026-11-13-countersign-design.md`, sections 6.1, 6.2, 8 and 9. **Parent plan:** `docs/superpowers/plans/2026-11-14-countersign-v1.md`. Its header (Global Constraints, Decisions, Conventions) binds every task here. This file expands that plan's S2-7 to S2-10.

## Global Constraints

All of the parent plan's Global Constraints apply, unchanged. The ones this pull request leans on most:

- Permissions stay `unlimitedStorage`, `storage`, `downloads`, `activeTab`, `scripting` on this branch (`alarms` arrives with PR 2). This pull request adds **no** permission and no browser API. If one seems needed, stop and report.
- `core/` sees no DOM and no `browser.*`.
- Only `id` and `createdAt` are required on a record. Readers tolerate missing fields, odd types, dangling links and unknown keys without throwing.
- No `style` props (the CSP has no `style-src 'unsafe-inline'`). Forms call `preventDefault`.
- Every data write is `app.apply(builder)`, where the builder reads the fresh snapshot it is given. One user action is one `apply` call (one batch, one write for PR 2's counter).
- A mismatch warning never blocks saving.
- Nothing closes an application by itself.
- No schema bump: every new field is optional, so schema 2 holds it.
- Synthetic fixtures only. Commits carry no AI attribution. Never `git add` `docs/superpowers/prompts/` or `.superpowers/`.

## Review Focus

1. **Odd restored records.** A statement whose `value` is `null`, a string or an array; an `exception` that is `"yes"`; a statement whose `answerKey` matches no answer; a canonical answer with no value or a different type. The application page must still render, and `checkStatement` must return `'compare'`, never throw. Tests: Task 2.
2. **Updating the canonical from one application.** It must append the old value to the answer's history exactly as the Answers page does, and must not write any statement, including other applications' entries. Tests: Task 1.
3. **Closing a list that changed meanwhile.** Another tab closed one of the selected applications, or added a later status, between render and click. Only applications still at Applied get one No response event; running the same close twice writes nothing the second time. Tests: Task 6.
4. **The quiet boundary and dates.** Exactly N days quiet is not listed; N+1 is. An event with no `occurredOn` uses its creation day. A voided later event does not reset the clock. A cut-off of `0`, `-5`, `2.5`, `"30"` or missing falls back to 30. Tests: Tasks 5 and 6.
5. **Deleting an application.** Its statements must go with it, or they become invisible orphans that still export. And an old export with none of the new fields still restores. Tests: Task 1 (cascade) and Task 9 (round trip).

## Upstream findings

None needed. This pull request uses no new library, browser API or permission.

## Decisions made in this plan

1. **The mismatch check is live, not stored.** `checkStatement` compares an entry with the canonical answer as it is now, every time the page renders. Spec 6.1 says "when an entry is saved, it is compared"; a derived check gives the same result at save time and needs no stored warning state (the same choice as "archived is derived"). **Consequence:** after you update a canonical answer, older entries on other applications that matched the old value now show a warning. That is deliberate: they are a record of what that company was told, and the warning is what you want to see before an interview there. "Keep as exception" clears it.
2. **The mismatch table.** In order; the first rule that applies wins.

   | Condition                                                                                                                                                   | Result                                 |
   | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
   | `statement.exception === true`                                                                                                                              | `exception`                            |
   | No answer for the key, the canonical has no valid value, or the statement has no valid value                                                                | `compare`                              |
   | Statement type differs from the canonical type                                                                                                              | `compare`                              |
   | **yes/no:** both booleans; differ                                                                                                                           | `mismatch`, else `ok`                  |
   | **choice:** both strings, compared after trim; differ (including a choice no longer in `choices`)                                                           | `mismatch`, else `ok`                  |
   | **money:** both currencies present and differ (case-insensitive, trimmed), or both periods present and differ                                               | `compare`                              |
   | **money:** the canonical has neither bound, or the statement has neither figure                                                                             | `compare`                              |
   | **money:** any statement figure (its `min`, its `max`, each if present) is below the canonical `min` (if present) or above the canonical `max` (if present) | `mismatch`, else `ok`                  |
   | **date:** either side not a valid `YYYY-MM-DD`                                                                                                              | `compare`                              |
   | **date:** statement date earlier than the canonical date                                                                                                    | `mismatch`, else `ok` (later or equal) |
   | **text**                                                                                                                                                    | `compare`                              |

   A money entry where you named one figure is stored with only `min`. "One bound missing" on the canonical side means unbounded on that side.

3. **"Keep as exception" sticks until the entry is edited.** Editing an entry's value clears `exception`, so the new value is checked again.
4. **"Update canonical" copies the entry's value into the canonical answer, whole,** through `reviseAnswer`. For money, a single named figure replaces the range; edit the range on the Answers page afterwards if needed. Only the canonical answer is written.
5. **Entries are tied to canonical answers.** "Add" picks one of the canonical answers (the six defaults). An ad-hoc entry with no canonical answer is not in this pull request; use the application notes. An entry whose key matches no answer is still listed, under its key, with `compare`.
6. **Deleting an application deletes its statements** in the same batch (`deleteApplicationOps`).
7. **The quiet rule reuses `currentStatus` and `effectiveDate`** through `applicationRows`. An application is quiet when its current status is `applied` and `daysBetween(statusDate, today) > cutoff`. Day counts come from `YYYY-MM-DD` strings via `Date.UTC`, so they are timezone-free.
8. **The cut-off is an integer from 1 to 365.** Anything else, stored or typed, means the default 30. The settings page refuses to save an invalid value and says why.
9. **Closing re-checks fresh data.** `closeAsNoResponseOps` runs inside the `apply` builder and adds a `no_response` event dated today only for applications that still exist and are still at Applied. One click is one batch.
10. **Settings are saved under the write lock.** `AppData.saveSettings(patch)` runs as one `queue.exclusive` turn: load, merge, save. Restore also writes settings inside that lock, so the two cannot interleave. Other tabs are told through the existing `BroadcastChannel`. A settings save does not count as a write for PR 2's backup counter (settings are not in IndexedDB; the weekly rule covers them).
11. **A status label equal to its default, or blank, is stored as no override,** so a later change to a default label still shows.
12. **The quiet list is its own page,** `#/quiet`, beside a `#/settings` page in the nav. PR 4's deadlines view consumes `quietApplications` directly.
13. **The Formhand log is three optional fields on `Application`:** `siteType`, `fillOutcome`, `fillNote`. No schema bump. Export and restore are structural, so they pass through; Task 9 proves the round trip.
14. **The value editor is extracted, not copied.** `AnswerEditor`'s typed inputs move into a `useAnswerDraft` hook that both the Answers page and the statements section use.

## What could bite us

- **Rebase on PR 2.** PR 2 (`feat/stage2-backup`) also changes `shell/ui/app-data.tsx` (opens the repository with `onWrite`), `shell/ui/App.tsx` (adds `<BackupStatus />`), `shell/ui/styles.css` and the v1 plan's pointer lines. Keep both sides in each.
- **Task 7 and Task 8 each touch more than three files.** The route and nav edits are two or three mechanical lines per file.
- **The UI is checked by hand** (parent decision 13). Each UI task lists its hand checks.

## File structure (new and changed)

```
core/src/statements.ts        newStatement, putStatementOps, deleteStatementOps, resolveByUpdatingCanonical, resolveAsException, statementsFor
core/src/mismatch.ts          MismatchResult, checkStatement
core/src/settings.ts          NO_RESPONSE_DAYS_DEFAULT, noResponseDays, parseNoResponseDays, withStatusLabel
core/src/quiet.ts             QuietRow, quietApplications, closeAsNoResponseOps
core/src/formhand.ts          SITE_TYPES, FILL_OUTCOMES and their labels
core/src/dates.ts             + daysBetween
core/src/application-ops.ts   deleteApplicationOps also deletes statements
core/src/types.ts             Settings.noResponseDays; Application.siteType, fillOutcome, fillNote
shell/ui/AnswerValueInput.tsx useAnswerDraft (extracted from AnswerEditor)
shell/ui/AnswerEditor.tsx     uses useAnswerDraft
shell/ui/StatementsSection.tsx
shell/ui/ApplicationDetail.tsx  statements section, Formhand log
shell/ui/SettingsPage.tsx, shell/ui/QuietList.tsx
shell/ui/app-data.tsx         AppData.saveSettings
shell/ui/route.ts, route.test.ts, App.tsx   #/settings, #/quiet
```

## Pull request

Branch `feat/stage2-statements`, Tasks 1 to 9. Hand checks are listed in Tasks 4, 7, 8 and 9.

---

## Task 1: Statement operations (S2-7a)

**Model:** sonnet. **Review:** reviewer-risk (data operations, cascade delete).

**Files:**

- Create: `core/src/statements.ts`
- Modify: `core/src/application-ops.ts:159-168` (`deleteApplicationOps`)
- Test: `core/src/statements.test.ts` (the cascade test lives here too, so there is one test file)

**Interfaces:**

- Consumes `reviseAnswer(answer, value, deps)` from `core/src/answers.ts`, `WriteOp`, `Deps`, `Statement`, `CanonicalAnswer`, `AnswerValue`, `Snapshot`.
- Produces:
  ```ts
  export function statementsFor(data: Snapshot, applicationId: Id): Statement[]; // oldest createdAt first, then id
  export function newStatement(
    answer: CanonicalAnswer,
    applicationId: Id,
    deps: Deps,
  ): Statement; // draft, not written
  export function putStatementOps(
    statement: Statement,
    value: AnswerValue | undefined,
  ): WriteOp[];
  export function deleteStatementOps(statementId: Id): WriteOp[];
  export function resolveByUpdatingCanonical(
    statement: Statement,
    answer: CanonicalAnswer,
    deps: Deps,
  ): WriteOp[];
  export function resolveAsException(statement: Statement): WriteOp[];
  ```
- **Rules:**
  - `newStatement`: `{ id: deps.newId(), createdAt: deps.now(), applicationId, answerKey: answer.key }`, plus `value` as a copy (`{ ...answer.value }`; `AnswerValue` is flat, and `structuredClone` is not in `core`'s lib) when `answer.value` is a plain object. No `exception`.
  - `putStatementOps`: one `put` to `statements` with `value` set (or removed when `undefined`) and `exception` removed (decision 3).
  - `resolveByUpdatingCanonical`: when `statement.value` is a plain object, `reviseAnswer(answer, statement.value, deps)`; one `put` to `canonicalAnswers` if it changed, else `[]`. Never a `statements` op (decision 4).
  - `resolveAsException`: one `put` to `statements` with `exception: true`.
  - `deleteApplicationOps(data, applicationId)` also deletes every statement whose `applicationId` matches, before the application delete.

- [ ] **Step 1: Write the failing tests:**
  - `newStatement` from a money answer `{ type: 'money_range', min: 100000, max: 130000, currency: 'USD', period: 'year' }` copies the value; mutating the copy leaves the answer unchanged; no value on the answer gives no `value`.
  - `putStatementOps` on an entry with `exception: true` returns one put with the new value and no `exception`; `undefined` removes `value`.
  - **'updates the canonical and keeps its history'.** Canonical `{ type: 'date', value: '2027-01-04' }`, entry `{ type: 'date', value: '2026-12-01' }`: one op, store `canonicalAnswers`, `value` is the entry's, `history` ends with `{ value: { type: 'date', value: '2027-01-04' }, replacedAt: <deps.now()> }`.
  - **'never writes statements when updating the canonical'.** With two applications' entries in the snapshot, every op's store is `canonicalAnswers`.
  - Updating with an equal value, or with an entry that has no value, returns `[]`.
  - `resolveAsException` sets `exception: true` and keeps every other field.
  - **'deletes statements with their application'.** Two statements on `a1`, one on `a2`: `deleteApplicationOps(data, 'a1')` deletes both `a1` statements and not the `a2` one; the application delete is last.
  - `statementsFor` ignores other applications and orders by `createdAt`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/statements.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test file, then `npx vitest run --project unit core/src/application-ops.test.ts`. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 3 files with the message `Add statement operations`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 2: Mismatch check (S2-7b)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**

- Create: `core/src/mismatch.ts`
- Test: `core/src/mismatch.test.ts`

**Interfaces:**

- Consumes `isLocalDate`, `compareLocalDate`, `Statement`, `CanonicalAnswer`.
- Produces:
  ```ts
  export type MismatchResult = 'ok' | 'mismatch' | 'compare' | 'exception';
  export function checkStatement(
    statement: Statement,
    answer: CanonicalAnswer | undefined,
  ): MismatchResult;
  ```
- **Rules:** decision 2's table, in order. Every field is read as `unknown` and type-checked; non-finite numbers count as absent.

- [ ] **Step 1: Write the failing tests,** one `it` per row, using small `money(min?, max?, extra?)`-style helpers:
  - exception: `exception: true` on a differing yes/no gives `exception`; `exception: 'yes'` does not.
  - yes/no: `true` vs `false` gives `mismatch`; equal gives `ok`.
  - choice: `'No'` vs canonical `'Yes'` gives `mismatch`; `' Yes '` vs `'Yes'` gives `ok`; a value not in `choices` that equals the canonical gives `ok`.
  - money, canonical 100000-130000: told `90000` (min only) gives `mismatch`; `140000` gives `mismatch`; `120000` gives `ok`; told range `110000-140000` gives `mismatch`; `110000-120000` gives `ok`.
  - money, one canonical bound missing: canonical min 100000 only, told 500000 gives `ok`, told 90000 gives `mismatch`; canonical max 130000 only, told 50000 gives `ok`.
  - money: canonical with neither bound gives `compare`; told with neither figure gives `compare`; currency `'USD'` vs `'eur'` gives `compare`; `'usd'` vs `'USD'` is the same; period `hour` vs `year` gives `compare`; one side missing a currency is not a difference.
  - date: told `2026-12-01` vs canonical `2027-01-04` gives `mismatch`; equal and later give `ok`; `'soon'` gives `compare`.
  - text gives `compare`, even when equal.
  - **Review Focus 1:** answer `undefined`; canonical with no value; statement `value` of `null`, `'x'` and `[]`; statement type `date` vs canonical `money_range`: each gives `compare` and nothing throws.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/mismatch.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** with the message `Add the mismatch check`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 3: Extract the answer value input (S2-8a)

**Model:** haiku. **Review:** reviewer-logic (behaviour unchanged).

**Files:**

- Create: `shell/ui/AnswerValueInput.tsx`
- Modify: `shell/ui/AnswerEditor.tsx`

**Interfaces:**

- Produces, moved out of `AnswerEditor.tsx` (lines 15-53, 66-79, 86-126, 164-308) with no behaviour change:
  ```ts
  export type AnswerKind =
    'yes_no' | 'choice' | 'money_range' | 'date' | 'text';
  export function kindOf(type: unknown): AnswerKind; // unknown -> 'text'
  export function choicesOf(choices: unknown): string[]; // strings only
  export type DraftResult =
    { value: AnswerValue | undefined } | { problem: string };
  export function useAnswerDraft(opts: {
    kind: AnswerKind;
    choices: string[];
    initial: unknown; // the stored AnswerValue, unchecked
    name: string; // unique per editor, for radio groups
    label: string; // aria-label
    onEdit?: () => void;
  }): { input: VNode; build(): DraftResult };
  ```
- `AnswerEditor` keeps its form, save, history and messages, and calls `useAnswerDraft({ kind: kindOf(answer.type), choices: choicesOf(answer.choices), initial: answer.value, name: 'yn-' + answer.id, label, onEdit: edited })`.

- [ ] **Step 1: Move the code.** No test (parent decision 13); the gate's typecheck and lint cover the move.
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 3: Hand check (controller or owner):** the Answers page edits each of the six answer types exactly as before, including the money "Enter amounts as numbers." message.
- [ ] **Step 4: Commit** both files with the message `Extract the answer value input`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 4: "What I told them" on the application (S2-8b)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**

- Create: `shell/ui/StatementsSection.tsx`
- Modify: `shell/ui/ApplicationDetail.tsx` (render `<StatementsSection applicationId={id} />` under a `<h2>What I told them</h2>`, after Documents)
- Modify: `shell/ui/styles.css` only if a class is needed (for example `.warning`)

**Interfaces:**

- Consumes Task 1 (`statementsFor`, `newStatement`, `putStatementOps`, `deleteStatementOps`, `resolveByUpdatingCanonical`, `resolveAsException`), Task 2 (`checkStatement`), Task 3 (`useAnswerDraft`, `kindOf`, `choicesOf`), `answerProblem`, `formatAnswer`, `useAppData()`.
- **Behaviour:**
  1. List `statementsFor(data, applicationId)`. Each row shows the answer's label (or the raw `answerKey`, or "Unknown answer") and `formatAnswer(value)` (or "(empty)"), then by `checkStatement(statement, answer)`:
     - `ok`: nothing more;
     - `mismatch`: a warning line "Differs from your answer: {formatAnswer(canonical)}" with buttons "Update canonical" and "Keep as exception";
     - `compare`: "Your answer: {formatAnswer(canonical) or 'none'}" beside it;
     - `exception`: "Kept as an exception".
  2. Each row has "Edit" (an inline editor from `useAnswerDraft`, kind from the answer, else from the stored value's `type`; "Save" and "Cancel") and "Delete" (with `confirm('Delete this entry?')`).
  3. "Add" is a select of the canonical answers by label plus an "Add" button. It opens the inline editor pre-filled from `newStatement(answer, applicationId, deps).value`. "Save" writes the draft with `putStatementOps`.
  4. A value problem from `build()` or `answerProblem` is shown and stops that save (it is malformed input, not a mismatch). **A mismatch never stops a save:** the warning appears after the save.
  5. Every write is `app.apply((d) => …)` that finds the fresh statement (and fresh answer) by id, returning `[]` if gone. "Update canonical" and "Keep as exception" each are one `apply`.
  6. One `busy` flag disables all buttons while a write is in flight. Every failure shows its message beside the row. Nothing is swallowed.
  7. No `style` props; forms call `preventDefault`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 3: Commit** the files with the message `Show what I told them on the application`.
- [ ] **Hand checks (owner, at review):**
  - Add a salary entry: it is pre-filled with the canonical range. Change it to a figure above the maximum. It saves, and the warning appears.
  - "Keep as exception": the warning goes. Edit the entry: the warning returns.
  - "Update canonical": the Answers page shows the new value and the old one in its history. Another application's entry is unchanged.
  - A start date later than the canonical: no warning. Earlier: warning.
  - Reason for leaving shows both texts side by side, no warning.
  - Deleting the application removes its entries (Data page counts drop).

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 5: Settings rules (S2-9a)

**Model:** haiku. **Review:** reviewer-logic.

**Files:**

- Create: `core/src/settings.ts`
- Modify: `core/src/types.ts:129-131`: `Settings` gains `noResponseDays?: number`
- Test: `core/src/settings.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export const NO_RESPONSE_DAYS_DEFAULT = 30;
  export function noResponseDays(settings: Settings): number; // integer 1..365, else 30
  export function parseNoResponseDays(text: string): number | undefined; // trimmed digits only, 1..365, else undefined
  export function withStatusLabel(
    labels: Settings['statusLabels'],
    key: StatusKey,
    text: string,
  ): Partial<Record<StatusKey, string>>;
  ```
- `withStatusLabel` returns a new object. Trimmed blank text, or text equal to `DEFAULT_STATUS_LABELS[key]`, removes the key (decision 11). Otherwise it stores the trimmed text. Other keys are kept. `undefined` or a non-object `labels` counts as `{}`.

- [ ] **Step 1: Write the failing tests:**
  - `noResponseDays({})` is 30; `{ noResponseDays: 45 }` is 45; `0`, `-5`, `2.5`, `366`, `NaN` and `'30'` (cast) give 30; `1` and `365` are kept.
  - `parseNoResponseDays`: `' 45 '` gives 45; `''`, `'0'`, `'2.5'`, `'1e2'`, `'-3'`, `'366'`, `'abc'` give `undefined`.
  - `withStatusLabel`: sets `'Sent'` for `applied`; `'  '` removes it; `'Applied'` removes it; leaves `rejected` alone; does not mutate the input; works from `undefined`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/settings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 3 files with the message `Add settings rules`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 6: Quiet rule and close (S2-9b)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**

- Create: `core/src/quiet.ts`
- Modify: `core/src/dates.ts` (add `daysBetween`)
- Test: `core/src/quiet.test.ts` (covers `daysBetween` too)

**Interfaces:**

- Consumes `applicationRows`, `ApplicationRow`, `currentStatus`, `addStatusEventOps`, `isLocalDate`, `Snapshot`, `Deps`.
- Produces:
  ```ts
  // dates.ts
  export function daysBetween(
    from: LocalDate,
    to: LocalDate,
  ): number | undefined; // whole days, to - from, via Date.UTC; undefined if either is not isLocalDate
  // quiet.ts
  export interface QuietRow extends ApplicationRow {
    statusDate: LocalDate;
    quietDays: number;
  }
  export function quietApplications(
    data: Snapshot,
    cutoffDays: number,
    today: LocalDate,
  ): QuietRow[];
  export function closeAsNoResponseOps(
    data: Snapshot,
    applicationIds: readonly Id[],
    today: LocalDate,
    deps: Deps,
  ): WriteOp[];
  ```
- **Rules:**
  - `quietApplications`: rows from `applicationRows(data)` with `status === 'applied'`, a valid `statusDate`, and `daysBetween(statusDate, today) > cutoff`. A `cutoffDays` that is not an integer from 1 to 365 means 30 (use `noResponseDays({ noResponseDays: cutoffDays })` from Task 5). Sorted oldest `statusDate` first, then by id.
  - `closeAsNoResponseOps`: for each distinct id whose application exists and whose `currentStatus` is `applied`, `addStatusEventOps(id, { status: 'no_response', occurredOn: today }, deps)`. Others are skipped silently. The caller runs it inside the `apply` builder (decision 9).

- [ ] **Step 1: Write the failing tests.** Dates are `LocalDate` strings; `createdAt` instants use `T12:00:00.000Z`.
  - `daysBetween('2026-10-16', '2026-11-15')` is 30; across a DST change and a leap day (`'2028-02-28'` to `'2028-03-01'` is 2); `'x'` gives `undefined`.
  - **'boundary'.** Applied on `2026-10-16`, today `2026-11-15`, cut-off 30: not listed. Applied on `2026-10-15`: listed with `quietDays: 31`.
  - **'a later event resets it'.** Applied `2026-09-01`, then Phone screen `2026-10-01`: not listed. Applied `2026-09-01`, then Applied again `2026-11-01`: not listed.
  - **'voided events are ignored'.** Applied `2026-09-01`, then a voided Phone screen `2026-10-01`: listed.
  - No `occurredOn`: the creation day counts.
  - Cut-off `0`, `-5` and `2.5` behave as 30.
  - A status event for a missing application and an application with no company do not throw.
  - **'closes only what is still applied'.** Ids `[a1, a2, a3, a1]` where `a2` is now Rejected and `a3` no longer exists: exactly one op, a `no_response` event for `a1` dated today.
  - **'closing twice writes nothing the second time'.** Apply the first ops to the snapshot; the second call returns `[]`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/quiet.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 3 files with the message `Add the quiet rule and close as No response`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 7: Settings page and save path (S2-9c)

**Model:** sonnet. **Review:** reviewer-risk (settings persistence, lock).

**Files:**

- Modify: `shell/ui/app-data.tsx`: `AppData.saveSettings`
- Create: `shell/ui/SettingsPage.tsx`
- Modify: `shell/ui/route.ts`, `shell/ui/route.test.ts`, `shell/ui/App.tsx`: route `{ page: 'settings' }` at `#/settings`, nav link "Settings" after "Data"

This task touches 5 files; the route and nav edits are mechanical.

**Interfaces:**

- Consumes Task 5 (`noResponseDays`, `parseNoResponseDays`, `withStatusLabel`), `loadSettings`, `saveSettings`, `STATUS_KEYS`, `statusLabel`.
- Produces on `AppData`:
  ```ts
  /** Merges patch into the stored settings in one exclusive queue turn (under the write lock), then reloads and tells other tabs. */
  saveSettings(patch: Partial<Settings>): Promise<void>;
  ```
  Implementation: `await queue.exclusive(async () => { const cur = await loadSettings(area); await saveSettings(area, { ...cur, ...patch }); })`, then `await reload()`, then `tellOtherTabs()`.
- **Settings page:** one form.
  - "Quiet after (days)" text input, starting at `noResponseDays(settings)`.
  - One text input per status in `STATUS_KEYS`, starting at `statusLabel(key, settings.statusLabels)`, with the default label shown as a hint.
  - "Save": `parseNoResponseDays` failing shows "Enter a whole number of days from 1 to 365." and saves nothing. Otherwise one `saveSettings({ noResponseDays, statusLabels })`, where `statusLabels` folds `withStatusLabel` over every key. Shows "Saved"; a failure shows its message.

- [ ] **Step 1: Write the failing route tests:** `parseRoute('#/settings')` gives `{ page: 'settings' }`; `'#/settings/x'` gives applications; `routeHref({ page: 'settings' })` is `'#/settings'`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/ui/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the route, nav, `saveSettings` and the page.
- [ ] **Step 4: Run** the test, then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 5 files with the message `Add a settings page`.
- [ ] **Hand checks (owner, at review):**
  - Rename Applied to "Sent" and save: the Applications list and the status selects show "Sent". Clear it: "Applied" returns.
  - Set the cut-off to 45 and save; with a second dashboard tab open, it shows 45 after the save.
  - Type `0` or `abc`: the message appears and nothing is saved.
  - Export, change the cut-off, restore the export: the old cut-off returns.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 8: Quiet list page (S2-9d)

**Model:** sonnet. **Review:** reviewer-risk (bulk status change).

**Files:**

- Create: `shell/ui/QuietList.tsx`
- Modify: `shell/ui/route.ts`, `shell/ui/route.test.ts`, `shell/ui/App.tsx`: route `{ page: 'quiet' }` at `#/quiet`, nav link "Quiet" after "Applications"

**Interfaces:**

- Consumes Task 6 (`quietApplications`, `closeAsNoResponseOps`, `QuietRow`), Task 5 (`noResponseDays`), `toLocalDate`, `routeHref`.
- **Page:**
  - Heading "Quiet for more than {N} days", where N is `noResponseDays(settings)`. A link to Settings to change it.
  - Empty list: "Nothing is quiet."
  - Each row: a checkbox, company and title linking to the application, "Applied {statusDate}, {quietDays} days ago", and a "Close as No response" button.
  - "Close selected ({k})", disabled when nothing is selected.
  - Both actions ask `confirm('Close {k} application(s) as No response?')`, then run one `apply((d) => { const ops = closeAsNoResponseOps(d, ids, today, deps); closed = ops.length; return ops; })`, with `today = toLocalDate(new Date())` taken at the click.
  - After the write: "Closed {closed}." If `closed` is less than the number asked, add "Some had already changed." Selection is cleared.
  - Selected ids not in the current list are dropped before use.
  - One `busy` flag disables the buttons while a write is in flight. Failures show their message. Nothing closes without a click and a confirm.

- [ ] **Step 1: Write the failing route tests** in the style of Task 7, for `quiet`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/ui/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 4 files with the message `Add the quiet list`.
- [ ] **Hand checks (owner, at review),** with demo data or entries backdated through "Add status":
  - An application Applied 40 days ago is listed; one Applied 10 days ago is not.
  - Close one: it leaves the list and shows No response (archived) on the Applications page.
  - Select two and close them together: one confirm, both closed.
  - Cancel the confirm: nothing changes.
  - Close one in a second tab, then "Close selected" including it in the first: "Closed 1. Some had already changed."

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 9: Formhand log (S2-10)

**Model:** haiku. **Review:** reviewer-logic.

**Files:**

- Create: `core/src/formhand.ts`
- Modify: `core/src/types.ts` (`Application` gains `siteType?: SiteType; fillOutcome?: FillOutcome; fillNote?: string;`, with the types imported from `formhand.ts` as `status.ts`'s `StatusKey` is)
- Modify: `shell/ui/ApplicationDetail.tsx` (a "Formhand log" section after "What I told them")
- Test: `core/src/export.test.ts`

**Interfaces:**

- Produces in `formhand.ts`:
  ```ts
  export const SITE_TYPES = [
    'greenhouse',
    'lever',
    'ashby',
    'workday',
    'linkedin',
    'indeed',
    'other',
  ] as const;
  export type SiteType = (typeof SITE_TYPES)[number];
  export const SITE_TYPE_LABELS: Record<SiteType, string>; // Greenhouse, Lever, Ashby, Workday, LinkedIn, Indeed, Other
  export const FILL_OUTCOMES = [
    'worked',
    'partly',
    'failed',
    'not_used',
  ] as const;
  export type FillOutcome = (typeof FILL_OUTCOMES)[number];
  export const FILL_OUTCOME_LABELS: Record<FillOutcome, string>; // Worked, Partly, Failed, Not used
  ```
- **UI:** two plain selects ("Application site" and "How filling went"), each with a blank "Not recorded" option, and a "Fill note" text input. Each saves through the existing `save(patch, report)` in `ApplicationDetail`; the blank option saves `undefined`. A stored value outside the list reads as blank (the `actor` pattern at `ApplicationDetail.tsx:165`).

- [ ] **Step 1: Write the failing tests** in `export.test.ts`:
  - **'round-trips the Formhand fields and the cut-off'.** An application with `siteType: 'workday'`, `fillOutcome: 'partly'`, `fillNote: 'Skipped the address step'`, a statement with `exception: true`, and settings `{ noResponseDays: 45 }`: build, serialise and `parseExport` give the same records and settings.
  - **'restores an export without the new fields'.** The schema 1 fixture still parses, with no `siteType` on any application and settings without `noResponseDays`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/export.test.ts`. Expected: both tests PASS at runtime already (export is structural; they are regression guards), but `npm run typecheck` fails on the new fields until the types exist. Record that as the RED.
- [ ] **Step 3: Implement** the module, the types and the section.
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 4 files with the message `Add the Formhand log`.
- [ ] **Hand check (owner, at review):** set all three fields, reload: they stay. Set back to "Not recorded": the field is removed.

Hard stop at 80 tool calls: commit what is done, report what remains.
