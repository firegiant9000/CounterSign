# Countersign Stage 2, Pull Request 4: Contacts, Deadlines, Copy Panel, Release 0.2.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep simple contacts per company with the "anyone here?" prompt, show one deadlines list, add a "My details" copy panel, and close stage 2 with demo data, docs and version 0.2.0.

**Architecture:** The rules are pure functions in `core/`: contact and company operations with the prompt rule, task operations, the deadlines list, and profile fields. The shell adds a contacts page, an "anyone here?" block shared by the popup and the application page, a deadlines page, and a "My details" page. Every data write goes through `app.apply` (one queue turn, one batch). Clipboard writes go through one small shell helper.

**Tech Stack:** Same as the v1 plan. No new dependency or permission. One new browser API: `navigator.clipboard.writeText`, called from a click handler.

**Spec:** `docs/superpowers/specs/2026-11-13-countersign-design.md`, sections 6.3 (the prompt in the popup), 6.4, 6.7, 6.10, 8 and 11. **Parent plan:** `docs/superpowers/plans/2026-11-14-countersign-v1.md`. Its header (Global Constraints, Decisions, Conventions) binds every task here. This file expands that plan's S2-11 to S2-14, and adds the stage 2 fixture S2-1 deferred to "the end of the stage".

## Global Constraints

All of the parent plan's Global Constraints apply, unchanged. The ones this pull request leans on most:

- Permissions stay `unlimitedStorage`, `storage`, `downloads`, `alarms`, `activeTab`, `scripting`. This pull request adds **no** permission. `clipboardWrite` is **not** added (see Upstream findings). If a permission seems needed, stop and report.
- `core/` sees no DOM and no `browser.*`.
- Only `id` and `createdAt` are required on a record. Readers tolerate missing fields, odd types, dangling links and unknown keys without throwing.
- No `style` props (the CSP has no `style-src 'unsafe-inline'`). Forms call `preventDefault`.
- Every data write is `app.apply(builder)`, where the builder reads the fresh snapshot it is given. One user action is one `apply` call.
- No schema bump: every new field is optional, and the stores (`contacts`, `contactEvents`, `tasks`, `profileFields`) exist since schema 2.
- Synthetic fixtures only: invented names, `example.com` addresses and links. Commits carry no AI attribution. Never `git add` `docs/superpowers/prompts/` or `.superpowers/`.

## Review Focus

1. **The same company typed two ways.** Saving a job for ` example  robotics ` in the popup and answering "Checked, nobody" must mark the existing `Example Robotics` record, not create a second company. Adding a contact through either name must also land on that one record. Tests: Task 1.
2. **Odd restored records.** A contact with no `companyId` or no `name`; `anyoneHere` set to `true`, `'yes'` or `'nobody'`; a task with no title, a `dueOn` of `'soon'`, or a `doneAt` of `false`; two profile records with the same key, and one with an unknown key. Nothing throws. An unknown `anyoneHere` value counts as unanswered, and a bad `dueOn` counts as undated. Of two profile records with one key, the first one created wins. Tests: Tasks 1, 4 and 6.
3. **Removing demo data while the user's records touch it.** If the user added a contact at a demo company, that company stays and the contact stays. The user's tasks and profile are untouched. Running the removal twice writes nothing the second time. Tests: Task 8.
4. **Deadline dates.** An overdue row, a row due today and an undated task each sort and flag correctly. Archived applications give no next-action row. The quiet row's date is the day the application crossed the cut-off, using the cut-off from settings. Tests: Task 4.
5. **A copy that fails.** If `writeText` rejects, the page says so and never shows "Copied". A blank field has no copy button, so you cannot paste an empty string into a form by mistake. Hand checks: Task 7.

## Upstream findings (checked 2026-11-16)

| Question | Finding | Source | Confidence |
|---|---|---|---|
| Does copying need `clipboardWrite`? | "The methods are available from a secure context but only function after the extension's user performs transient activation." "With the "clipboardWrite" permission, transient activation isn't required." The permission is for writing "outside a short-lived event handler for a user action." | MDN: `WebExtensions/Interact_with_the_clipboard`, `manifest.json/permissions` | Verified for a click handler. That a `moz-extension:` page counts as a secure context is not stated: the Task 7 hand check confirms it. |
| Does a write after an `await` still count as a user action? | Not stated. The MDN example calls `writeText` straight from the click handler. | MDN: `API/Clipboard/writeText` | Unverified. **Rule:** call `writeText` synchronously in the click handler, before any `await`. |

## Decisions made in this plan

1. **"Anyone here?" is a pure rule on a company.** `Company.anyoneHere?: 'checked_nobody'` is the only stored answer. The rule: no company gives `none`. A company with contacts gives `show_contacts`. A company marked `checked_nobody` gives `none`. Otherwise it gives `ask`. Each company is asked once: after "Checked, nobody", the prompt stops, and adding a contact later shows that contact instead.
2. **The popup works from a company name.** A saved job holds `companyName`, not a company id. `anyoneHereForName` finds the company the way applications do (`findCompanyByName`). A name with no company record yet gives `ask`. A blank name gives `none`. Answering, either "Checked, nobody" or adding a contact, creates the company if it is missing, through one shared `findOrCreateCompanyOps`. `newApplicationOps` is refactored to use it too.
3. **Adding a contact from the prompt happens in place.** The popup and the application page both show one `ContactForm` (name, role, how you know them, notes) inside the `AnyoneHere` block. The contacts page uses the same form. Name is required in the UI. A contact keeps the company it was created with (no move between companies). To fix a mistyped company, delete the contact and add it again.
4. **The application page always shows a "People here" section** under the company heading, from the same `AnyoneHere` block. This covers "when an application is created" for applications made in the dashboard, and it stays useful afterwards.
5. **Contact events are stage 3 (S3-2).** This pull request writes none. `deleteContactOps` still deletes a contact's events, so that S3-2 inherits a correct cascade.
6. **Deadlines draw on three sources now:** next-action dates, the quiet list and open tasks. Follow-up dates and interview rounds join in stage 3. Rows:

   | Kind | From | Date | Who acts | Label |
   |---|---|---|---|---|
   | `task` | a task with no `doneAt` string | `dueOn` if `isLocalDate`, else undated | `me` | the trimmed title, or "Untitled task" |
   | `next_action` | an application that is not archived and has a valid `nextActionDate` | `nextActionDate` | `nextActor` (may be unset) | "{company} — {title}", with "Unknown company" and "Untitled" for blanks |
   | `quiet` | each `quietApplications(data, noResponseDays(settings), today)` row | `addDays(statusDate, cutoff + 1)`, the first day it counted as quiet | `me` | "{company} — {title}: quiet for {quietDays} days" |

   The order is: dated rows by date first, then undated rows. Ties go by kind (`task`, `next_action`, `quiet`), then by label, then by key. `overdue` is true when the date is earlier than `today`. An application can appear both as `next_action` and as `quiet`, because the two are different reasons to act.
7. **Tasks are free-form with a title and an optional due date.** The UI requires a title and accepts a blank date. Completing a task sets `doneAt`. Reopening it removes `doneAt`. Delete asks for confirmation. Done tasks leave the deadlines list and are listed under "Done", newest first, each with "Not done" and "Delete". `Task.applicationId` exists in the type but this pull request does not set it.
8. **Profile fields are a fixed list of 12 keys**, each stored as one `ProfileField { key, label, value }` record: Full name, Email, Phone, Address line 1, Address line 2, City, State or region, Postal code, Country, LinkedIn, GitHub, Website. Free-form extra fields are not in scope. A blank value deletes the record. If there are duplicate records for a key, the first one created wins, and saving that key deletes the others.
9. **The copy panel is its own dashboard page, `#/details`, named "My details".** It has two sections: your details (view mode with Copy buttons, plus one "Edit" form that saves every changed field in one `apply`), and your canonical answers (`formatAnswer(value)` with Copy; editing stays on the Answers page). Copy writes exactly the text shown.
10. **Clipboard access goes through `shell/clipboard.ts`.** `copyText(text): Promise<void>` calls `navigator.clipboard.writeText` and throws a plain `Error('Could not copy.')` when the clipboard API is missing. UI handlers call it synchronously in `onClick`, then show "Copied" for that row, or the failure message.
11. **Demo data gains contacts, a "checked, nobody" company, tasks, statements, Formhand fields and one quiet application.** It gains **no** profile fields. A demo name in "My details" would sit among the user's real fields, and editing it would keep the demo id, so removing demo data would delete the user's entry.
12. **Removing demo data keeps a demo company that one of the user's contacts references,** just as it already keeps one that a non-demo application references. It also deletes demo contacts, demo tasks and the events of contacts it removes.
13. **Nav order:** Applications, Deadlines, Quiet, Contacts, Answers, My details, Data, Settings.
14. **The stage 2 fixture** `core/fixtures/v2-export.fixture.json` holds one record in every store and every optional field added in stage 2 (parent plan S2-1, deferred "to the end of the stage").

## What could bite us

- **Stacked on PR #10.** This branch starts at `origin/feat/stage2-statements` (`c18164a`), and PR #10 is not merged yet. After it merges, rebase: `git rebase --onto origin/main c18164a feat/stage2-pr4`. That form is safe whether #10 is merged or squashed. Then rerun the gate before pushing. Do not open this pull request before #10 merges, or open it against `feat/stage2-statements` as a draft.
- **Tasks 2, 5 and 7 each edit `route.ts`, `route.test.ts` and `App.tsx`.** Run them in order, never in parallel.
- **The popup has limited height.** The `AnyoneHere` block and the contact form must not push "Open dashboard" off-screen. Keep the form compact. Hand check in Task 3.
- **Clipboard after `await`.** See the Upstream findings. A write deferred past an `await` may fail silently on some builds.
- **The UI is checked by hand** (parent decision 13). Each UI task lists its hand checks.

## File structure (new and changed)

```
core/src/types.ts             Company.anyoneHere
core/src/application-ops.ts   findOrCreateCompanyOps (newApplicationOps uses it)
core/src/contacts.ts          contactsAt, anyoneHerePrompt, anyoneHereForName, addContactOps, updateContactOps, deleteContactOps, markCheckedNobodyOps
core/src/dates.ts             + addDays
core/src/tasks.ts             newTaskOps, completeTaskOps, reopenTaskOps, deleteTaskOps, doneTasks
core/src/deadlines.ts         DeadlineKind, DeadlineRow, deadlines
core/src/profile.ts           PROFILE_FIELDS, ProfileKey, profileValues, setProfileFieldOps
core/src/demo.ts              new demo records; hasDemoData and removeDemoOps cover them
core/fixtures/v2-export.fixture.json
shell/clipboard.ts            copyText
shell/ui/ContactForm.tsx, ContactsPage.tsx, AnyoneHere.tsx
shell/ui/DeadlinesPage.tsx, CopyPanel.tsx
shell/ui/Popup.tsx, ApplicationDetail.tsx   AnyoneHere block
shell/ui/route.ts, route.test.ts, App.tsx   #/contacts, #/deadlines, #/details
README.md, docs/ARCHITECTURE.md, package.json, package-lock.json   0.2.0
```

## Pull request

Branch `feat/stage2-pr4`, Tasks 1 to 10. Hand checks are listed in Tasks 2, 3, 5, 7, 8 and 10.

---

## Task 1: Company lookup and contact rules (S2-11a)

**Model:** sonnet. **Review:** reviewer-risk (data operations, company creation, cascade delete).

**Files:**

- Modify: `core/src/types.ts:13-15`: `Company` gains `anyoneHere?: 'checked_nobody'`
- Modify: `core/src/application-ops.ts:48-68`: extract `findOrCreateCompanyOps`; `newApplicationOps` calls it
- Create: `core/src/contacts.ts`
- Test: `core/src/contacts.test.ts`

**Interfaces:**

- Consumes `findCompanyByName`, `normalizeName`, `WriteOp`, `Deps`, `Snapshot`, `Contact`, `Company`.
- Produces:
  ```ts
  // application-ops.ts
  export function findOrCreateCompanyOps(
    data: Snapshot,
    name: string,
    deps: Deps,
  ): { ops: WriteOp[]; companyId: Id | undefined }; // blank name: { ops: [], companyId: undefined }; existing: no ops; new: one put with the collapsed name
  // contacts.ts
  export type AnyoneHere = 'show_contacts' | 'ask' | 'none';
  export interface ContactInput {
    name?: string;
    role?: string;
    howKnown?: string;
    notes?: string;
  }
  export function contactsAt(data: Snapshot, companyId: Id): Contact[]; // by name case-insensitively (no name last), then id
  export function anyoneHerePrompt(
    data: Snapshot,
    companyId: Id | undefined,
  ): AnyoneHere; // decision 1
  export function anyoneHereForName(
    data: Snapshot,
    companyName: string | undefined,
  ): { prompt: AnyoneHere; companyId?: Id }; // decision 2
  export function addContactOps(
    data: Snapshot,
    companyName: string,
    input: ContactInput,
    deps: Deps,
  ): { ops: WriteOp[]; contactId: Id }; // throws Error('Enter a company name.') when the name is blank
  export function updateContactOps(
    contact: Contact,
    patch: ContactInput,
  ): WriteOp[]; // trims; a blank value removes that field; companyId never changes
  export function deleteContactOps(data: Snapshot, contactId: Id): WriteOp[]; // its contactEvents first, then the contact
  export function markCheckedNobodyOps(
    data: Snapshot,
    companyName: string,
    deps: Deps,
  ): WriteOp[]; // find or create, then put the company with anyoneHere: 'checked_nobody'; [] if already set or the name is blank
  ```
- Fields are read as `unknown` and type-checked. `anyoneHere` counts only when it is exactly `'checked_nobody'`.

- [ ] **Step 1: Write the failing tests:**
  - `findOrCreateCompanyOps`: `' example  robotics '` with `Example Robotics` stored gives no ops and the stored id. A new name gives one put named `'Example Robotics'` (collapsed). `'  '` gives no ops and `undefined`. Run the existing `application-ops.test.ts` unchanged as the refactor guard.
  - `anyoneHerePrompt`: `undefined` gives `none`. A dangling id gives `none`. A company with one contact gives `show_contacts`. A company with no contacts gives `ask`. `checked_nobody` gives `none`. `checked_nobody` plus a contact gives `show_contacts`. `anyoneHere` of `true`, `'yes'` or `'nobody'` gives `ask`.
  - `anyoneHereForName`: blank gives `{ prompt: 'none' }`. An unknown name gives `{ prompt: 'ask' }` with no id. `' example  robotics '` resolves to the stored company's prompt and id.
  - **'one company however it is typed'.** `markCheckedNobodyOps(data, ' example  robotics ', deps)` with `Example Robotics` stored gives exactly one put, to that company's id, with `anyoneHere: 'checked_nobody'` and its other fields kept. With no stored company, it gives one put that creates the company with the answer set. Called again on the result, it gives `[]`.
  - `addContactOps` with a new company name gives two puts (company, then contact with that `companyId`). With an existing one, it gives one put. Fields are trimmed and blank ones are omitted. A blank company name throws.
  - `updateContactOps` keeps `id`, `createdAt` and `companyId`, and removes a field set to `'  '`.
  - `deleteContactOps` deletes that contact's two events, not another contact's event, and the contact delete is last.
  - `contactsAt` orders `'bea'`, `'Cal'` and a nameless contact as `bea`, `Cal`, nameless, and ignores other companies. A contact with no `companyId` does not throw.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/contacts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test file, then `npx vitest run --project unit core/src/application-ops.test.ts`. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 4 files with the message `Add contact rules and the anyone-here prompt`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 2: Contact form and contacts page (S2-11b)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**

- Create: `shell/ui/ContactForm.tsx`, `shell/ui/ContactsPage.tsx`
- Modify: `shell/ui/route.ts`, `shell/ui/route.test.ts`, `shell/ui/App.tsx`: route `{ page: 'contacts' }` at `#/contacts`, with the nav placed as in decision 13

This task touches 5 files. The route and nav edits are mechanical.

**Interfaces:**

- Consumes Task 1 (`contactsAt`, `addContactOps`, `updateContactOps`, `deleteContactOps`, `ContactInput`), `useAppData()`.
- Produces:
  ```ts
  export function ContactForm(props: {
    initial?: ContactInput;
    submitLabel: string; // "Add contact" or "Save"
    busy: boolean;
    onSubmit(input: ContactInput): void;
    onCancel?: () => void;
  }): VNode; // name required ("Enter a name."); role, how you know them, notes optional
  ```
- **Contacts page:**
  - "Add a contact": a company text input with a `<datalist>` of the stored company names, plus `ContactForm`. Saving runs one `apply((d) => addContactOps(d, companyName, input, deps).ops)`.
  - Then one section per company that has contacts, sorted by company name, each listing `contactsAt`. Each contact shows name, role, how known and notes, with "Edit" (inline `ContactForm`, which saves `updateContactOps` on the fresh record, or `[]` if it is gone) and "Delete" (`confirm('Delete this contact?')`, then `deleteContactOps`).
  - Empty: "No contacts yet."
  - One `busy` flag. Every failure shows its message. Nothing is swallowed.

- [ ] **Step 1: Write the failing route tests:** `parseRoute('#/contacts')` gives `{ page: 'contacts' }`; `'#/contacts/x'` gives applications; `routeHref({ page: 'contacts' })` is `'#/contacts'`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/ui/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 5 files with the message `Add the contacts page`.
- [ ] **Hand checks (owner, at review):**
  - Add a contact at a new company, then add one at `example robotics` (the existing name typed in lowercase): both land under one company heading.
  - Edit a role, and clear it: the field goes away.
  - Delete with Cancel: nothing changes. Delete with OK: the contact is gone.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 3: "Anyone here?" in the popup and on the application (S2-11c)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**

- Create: `shell/ui/AnyoneHere.tsx`
- Modify: `shell/ui/Popup.tsx` (after the "Saved." facts, using the company name that was saved)
- Modify: `shell/ui/ApplicationDetail.tsx` (a "People here" `<h2>` section just after the `<h1>` company heading at line 197, using `company?.name`)

**Interfaces:**

- Consumes Task 1 (`anyoneHereForName`, `contactsAt`, `addContactOps`, `markCheckedNobodyOps`), Task 2 (`ContactForm`), `routeHref`.
- Produces:
  ```ts
  export function AnyoneHere(props: {
    companyName: string | undefined;
    compact?: boolean; // popup: list names and roles only, with no notes
  }): VNode | null;
  ```
- **Behaviour** (computed from `useAppData().data` on each render, so it follows writes):
  - `none`: renders nothing.
  - `show_contacts`: "You know people here:" and each contact's name and role (plus "how you know them" when not compact).
  - `ask`: "Do you know anyone at {companyName}?" with "Add a contact" (opens `ContactForm` inline) and "Checked, nobody" (one `apply((d) => markCheckedNobodyOps(d, companyName, deps))`). After either answer, the block re-renders from the data: it shows the new contact, or nothing.
  - One `busy` flag. Failures show their message.
- **Popup:** render `<AnyoneHere compact companyName={…} />` inside the "Saved." section. The name is the trimmed `companyName` of the `JobInput` that was saved (keep it in `facts`). A blank name renders nothing.

- [ ] **Step 1: Implement.** No new unit test: the rules are covered by Task 1, and parent decision 13 covers UI.
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0.
- [ ] **Step 3: Commit** the 3 files with the message `Ask anyone here when saving a job or opening an application`.
- [ ] **Hand checks (owner, at review):**
  - Save a job at a company you have never entered: the popup asks. Click "Checked, nobody", then save another job there: no prompt.
  - Save a job at a company with a contact: the popup lists them.
  - In the popup, "Add a contact": the contact appears in place, and on the dashboard's Contacts page. "Open dashboard" is still visible without scrolling.
  - Open an application at a company with no contacts and no answer: "People here" asks. Answer it, and it never asks again for that company.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 4: Tasks and the deadlines rule (S2-12a)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**

- Create: `core/src/tasks.ts`, `core/src/deadlines.ts`
- Modify: `core/src/dates.ts` (add `addDays`)
- Test: `core/src/deadlines.test.ts` (covers `tasks.ts` and `addDays` too, so there is one test file)

**Interfaces:**

- Consumes `applicationRows`, `quietApplications`, `noResponseDays`, `isLocalDate`, `compareLocalDate`, `Settings`, `Task`, `Actor`.
- Produces:
  ```ts
  // dates.ts
  export function addDays(day: LocalDate, days: number): LocalDate | undefined; // via Date.UTC; undefined if not isLocalDate
  // tasks.ts
  export function newTaskOps(
    input: { title: string; dueOn?: LocalDate },
    deps: Deps,
  ): { ops: WriteOp[]; taskId: Id }; // title trimmed; a blank or invalid dueOn is omitted
  export function completeTaskOps(task: Task, deps: Deps): WriteOp[]; // doneAt = deps.now(); [] if doneAt is already a string
  export function reopenTaskOps(task: Task): WriteOp[]; // removes doneAt; [] if not done
  export function deleteTaskOps(taskId: Id): WriteOp[];
  export function doneTasks(data: Snapshot): Task[]; // doneAt is a string; newest doneAt first, then id
  // deadlines.ts
  export type DeadlineKind = 'task' | 'next_action' | 'quiet';
  export interface DeadlineRow {
    key: string; // `${kind}:${id}`
    kind: DeadlineKind;
    date?: LocalDate;
    label: string;
    actor?: Actor;
    overdue: boolean;
    applicationId?: Id;
    taskId?: Id;
  }
  export function deadlines(
    data: Snapshot,
    settings: Settings,
    today: LocalDate,
  ): DeadlineRow[]; // decision 6
  ```

- [ ] **Step 1: Write the failing tests.** Dates are `LocalDate` strings; `createdAt` instants use `T12:00:00.000Z`. Today is `2026-11-16`.
  - `addDays('2026-11-16', 3)` is `'2026-11-19'`; `('2028-02-28', 1)` is `'2028-02-29'`; `('x', 1)` is `undefined`.
  - Task ops: `newTaskOps({ title: '  Call back  ', dueOn: '' })` stores `title: 'Call back'` and no `dueOn`. Complete, then complete again, gives `[]` the second time. Reopen removes `doneAt`. `doneTasks` orders by `doneAt` newest first and skips `doneAt: false`.
  - **'sorts by date with undated last'.** A task due `2026-11-20`, a next action on `2026-11-17` and an undated task give the order next action, task, undated task.
  - **'flags overdue'.** A next action on `2026-11-15` is overdue. One on `2026-11-16` is not.
  - **'skips archived and done'.** An application at Rejected with a next-action date gives no row. A done task gives no row.
  - **'quiet row dates from the cut-off'.** Applied `2026-10-01`, settings `{ noResponseDays: 30 }`: one `quiet` row dated `2026-11-01` (overdue), actor `me`. With `{ noResponseDays: 60 }`: no row.
  - **'both reasons show'.** One application that is quiet and has a next action gives two rows with different keys.
  - Ties on one date order as `task`, `next_action`, `quiet`.
  - Labels: no company gives "Unknown company — Untitled". A task with title `'  '` gives "Untitled task". `nextActor` of `'boss'` gives no `actor`.
  - **Review Focus 2:** a task with `dueOn: 'soon'` is undated. A task with `doneAt: false` is open. A task with no title does not throw.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/deadlines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 4 files with the message `Add tasks and the deadlines list`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 5: Deadlines page (S2-12b)

**Model:** sonnet. **Review:** reviewer-logic.

**Files:**

- Create: `shell/ui/DeadlinesPage.tsx`
- Modify: `shell/ui/route.ts`, `shell/ui/route.test.ts`, `shell/ui/App.tsx`: route `{ page: 'deadlines' }` at `#/deadlines`, nav as in decision 13

**Interfaces:**

- Consumes Task 4 (`deadlines`, `DeadlineRow`, `newTaskOps`, `completeTaskOps`, `reopenTaskOps`, `deleteTaskOps`, `doneTasks`), `toLocalDate`, `isLocalDate`, `routeHref`, `useAppData()`.
- **Page:**
  - "Add a task": a title (required: "Enter a title.") and a date (optional; an invalid date shows "Enter a valid date (YYYY-MM-DD).", as `ApplicationForm` does). One `apply`.
  - The list from `deadlines(data, settings, toLocalDate(new Date()))`. Each row shows the date (or "No date"), "Overdue" when flagged, the label, and who acts next ("Me", "Them" or "Not set"). Application rows link to the application. Quiet rows also link to `#/quiet`. Task rows have "Done" (`completeTaskOps` on the fresh task, or `[]` if it is gone) and "Delete" (`confirm('Delete this task?')`).
  - Empty: "Nothing due."
  - "Done ({n})": a `<details>` element listing `doneTasks`, each with "Not done" and "Delete".
  - One `busy` flag. Every failure shows its message.

- [ ] **Step 1: Write the failing route tests** in the style of Task 2, for `deadlines`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/ui/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** the 4 files with the message `Add the deadlines page`.
- [ ] **Hand checks (owner, at review),** with demo data:
  - The list mixes tasks, next actions and quiet rows, sorted by date. Overdue rows are marked.
  - Add a task with no date: it shows last, as "No date". Complete it: it moves under "Done". "Not done" brings it back.
  - Change the cut-off in Settings: the quiet row's date moves, or the row goes.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 6: Profile fields (S2-13a)

**Model:** haiku. **Review:** reviewer-logic.

**Files:**

- Create: `core/src/profile.ts`
- Test: `core/src/profile.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export const PROFILE_FIELDS = [
    { key: 'full_name', label: 'Full name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address_line1', label: 'Address line 1' },
    { key: 'address_line2', label: 'Address line 2' },
    { key: 'city', label: 'City' },
    { key: 'region', label: 'State or region' },
    { key: 'postal_code', label: 'Postal code' },
    { key: 'country', label: 'Country' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'github', label: 'GitHub' },
    { key: 'website', label: 'Website' },
  ] as const;
  export type ProfileKey = (typeof PROFILE_FIELDS)[number]['key'];
  export function profileValues(
    data: Snapshot,
  ): Partial<Record<ProfileKey, string>>; // per key, the first-created record (then lowest id) with a non-blank string value; unknown keys ignored
  export function setProfileFieldOps(
    data: Snapshot,
    key: ProfileKey,
    text: string,
    deps: Deps,
  ): WriteOp[];
  ```
- **`setProfileFieldOps`:** trim `text`. If it is blank, delete every record with that key. Otherwise put the first record for the key (keeping its `id` and `createdAt`, or a new one from `deps`) with `key`, the field's `label` and `value`, and delete the other records with that key. If the value and label are unchanged and there are no duplicates, return `[]`.

- [ ] **Step 1: Write the failing tests:**
  - Set `email` to `' sam@example.com '` on empty data: one put with `value: 'sam@example.com'`, `label: 'Email'`. Set it again to the same value: `[]`.
  - Change it: one put with the same `id` and `createdAt`.
  - Blank deletes the record.
  - **'duplicates resolve to the first'.** Two `phone` records: `profileValues` gives the older one's value. Setting `phone` puts the older one and deletes the newer one.
  - A record with key `'shoe_size'` is ignored by `profileValues` and never deleted. A record with `value: 42` reads as absent and does not throw.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/profile.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** both files with the message `Add profile fields`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 7: My details page with copy buttons (S2-13b)

**Model:** sonnet. **Review:** reviewer-risk (new browser API).

**Files:**

- Create: `shell/clipboard.ts`, `shell/ui/CopyPanel.tsx`
- Modify: `shell/ui/route.ts`, `shell/ui/route.test.ts`, `shell/ui/App.tsx`: route `{ page: 'details' }` at `#/details`, nav "My details" as in decision 13

This task touches 5 files. The route and nav edits are mechanical.

**Interfaces:**

- Consumes Task 6 (`PROFILE_FIELDS`, `profileValues`, `setProfileFieldOps`), `formatAnswer`, `useAppData()`.
- Produces:
  ```ts
  // shell/clipboard.ts
  export function copyText(text: string): Promise<void>; // decision 10
  ```
- **Page** (decision 9):
  - "Your details": each field with a value shows its label, the value and a "Copy" button. Fields without a value show "Not set" and no button. "Edit" turns the section into one form with a text input per field. "Save" runs one `apply((d) => PROFILE_FIELDS.flatMap((f) => setProfileFieldOps(d, f.key, draft[f.key] ?? '', deps)))`. "Cancel" drops the draft.
  - "Your answers": each canonical answer with a value shows its label, `formatAnswer(value)` and "Copy". A link goes to the Answers page for edits.
  - **Copy:** `onClick={() => { copyText(text).then(ok, fail); }}`, called synchronously with no `await` before it. "Copied" shows beside that row until the next copy. A failure shows "Could not copy." beside the row.
  - No `style` props.

- [ ] **Step 1: Write the failing route tests** in the style of Task 2, for `details`.
- [ ] **Step 2: Run** `npx vitest run --project unit shell/ui/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Check that `npm run build` still gives a manifest with no new permission (the build guard covers it).
- [ ] **Step 4: Run** the test, then `npm run gate`. Expected: exit 0, and web-ext still reports 0 errors and 2 warnings.
- [ ] **Step 5: Commit** the 5 files with the message `Add the My details copy panel`.
- [ ] **Hand checks (owner, at review)** in the installed build, which also settles the secure-context question from the Upstream findings:
  - Fill in your details, save and reload: they stay. Clear one: it shows "Not set" with no Copy button.
  - Copy Email, then paste it into a form on any site: it is exactly the stored value. Copy the salary answer: the pasted text matches what the page shows.
  - The browser shows no permission prompt, and about:addons lists no new permission.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 8: Demo data for stage 2 (S2-14a)

**Model:** sonnet. **Review:** reviewer-risk (bulk delete).

**Files:**

- Modify: `core/src/demo.ts`
- Test: `core/src/demo.test.ts`

**Interfaces:**

- Consumes `DEFAULT_ANSWERS` keys `salary_range` and `earliest_start_date`.
- **Adds to `buildDemoOps`** (all ids start with `demo-`, and all names are invented):
  - `demo-company-2` gets `anyoneHere: 'checked_nobody'`.
  - Contacts `demo-contact-1` (Sample Recruiter, Recruiter, "Met at a meetup", at `demo-company-1`) and `demo-contact-2` (Sample Engineer, Engineer, "Former colleague", at `demo-company-3`). `demo-company-4` has none and no answer, so it asks.
  - Tasks `demo-task-1` "Update the sample portfolio", due in 2 days, and `demo-task-2` "Sample finished task", with `doneAt: deps.now()`.
  - Statements `demo-statement-1` on `demo-application-2` (`salary_range`, `{ type: 'money_range', min: 95000, currency: 'USD', period: 'year' }`) and `demo-statement-2` on `demo-application-3` (`earliest_start_date`, the date 10 days after today).
  - Formhand: `demo-application-1` with `siteType: 'greenhouse'`, `fillOutcome: 'worked'`; `demo-application-2` with `siteType: 'workday'`, `fillOutcome: 'partly'`, `fillNote: 'Sample note: the address step was skipped.'`.
  - `demo-application-10` "Sample QA Analyst" at `demo-company-4`, with history `[['applied', 38]]`, so it appears in the quiet list.
  - No profile fields (decision 11).
- **`hasDemoData`** also checks `contacts`, `tasks` and `statements`.
- **`removeDemoOps`** also: keeps a demo company that a non-demo contact's `companyId` references; deletes demo-id contacts, the contact events of contacts being deleted, and demo-id tasks.

- [ ] **Step 1: Write the failing tests:**
  - `buildDemoOps` writes the records above. Every id starts with `demo-`. Every URL is `https://example.com/…`.
  - **'keeps a demo company the user added a contact to'.** Load demo data, add a non-demo contact at `demo-company-4`, then remove: `demo-company-4` and that contact remain, and every other demo record is gone.
  - **'leaves the user's tasks and profile alone'.** A non-demo task and a profile field survive removal.
  - **'removing twice writes nothing'.** Apply the removal ops to the snapshot, then call again: `[]`.
  - `hasDemoData` is true with only a demo task left.
  - Existing demo tests keep passing. Update counts that change because of `demo-application-10`.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/demo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** both files with the message `Cover stage 2 records in the demo data`.
- [ ] **Hand check (owner, at review):** load the demo data and visit every page. Each new view has something in it. Remove the demo data: the Data page counts return to your own records.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 9: Stage 2 export fixture (S2-14b)

**Model:** haiku. **Review:** reviewer-logic.

**Files:**

- Create: `core/fixtures/v2-export.fixture.json`
- Test: `core/src/export.test.ts`

**Interfaces:**

- Consumes `parseExport`, `buildExport`, `SCHEMA_VERSION`, and the shape of `core/fixtures/v1-export.fixture.json`.
- **Fixture:** schema 2, with at least one record in each of the 11 stores, and settings `{ noResponseDays: 45, statusLabels: { applied: 'Sent' } }`. It includes `Company.anyoneHere`, the Formhand fields, a statement with `exception: true`, a contact event linked to an application, a done task and an open task, and two profile fields. Names are invented, and addresses, links and URLs use `example.com`. The file name contains no `backup` and does not start with `countersign-export-`.

- [ ] **Step 1: Write the failing tests** in `export.test.ts`:
  - **'parses the schema 2 fixture'.** `parseExport` succeeds. Every store has the fixture's records, unchanged, and the settings come back.
  - **'round-trips the stage 2 fixture'.** Build, serialise and parse give the same records and settings.
- [ ] **Step 2: Run** `npx vitest run --project unit core/src/export.test.ts`. Expected: FAIL (the fixture is missing).
- [ ] **Step 3: Write the fixture.**
- [ ] **Step 4: Run** the test. Expected: PASS. Then `npm run gate`. Expected: exit 0.
- [ ] **Step 5: Commit** both files with the message `Add the schema 2 export fixture`.

Hard stop at 80 tool calls: commit what is done, report what remains.

## Task 10: Stage 2 docs and version 0.2.0 (S2-14c)

**Model:** sonnet, then owner. **Review:** reviewer-logic.

**Files:**

- Modify: `README.md` ("What it does today": save job, duplicate and repost facts, automatic backup, what I told them, quiet list, Formhand log, contacts with "anyone here?", deadlines, My details. "What is next": stage 3. "Permissions": check against the built manifest, and note that copy needs no clipboard permission.)
- Modify: `docs/ARCHITECTURE.md` ("Record types": contacts, tasks, profile fields, `Company.anyoneHere`; one line on how the deadlines list is derived; one line on the clipboard helper)
- Modify: `package.json`, `package-lock.json`: version `0.2.0` via `npm version 0.2.0 --no-git-tag-version`
- Modify: `docs/superpowers/plans/2026-11-14-countersign-v1.md`: the pointer line after the PR 3 pointer (if it isn't committed already with the plan)

**Rules:** the README still leads with the three claims. No real personal details. Only facts that the code on this branch makes true.

- [ ] **Step 1: Edit the docs and bump the version.**
- [ ] **Step 2: Run `npm run gate`.** Expected: exit 0. The built manifest reports `"version": "0.2.0"`.
- [ ] **Step 3: Commit** with the message `Document stage 2 and bump to 0.2.0`.
- [ ] **Owner steps, after merge:** sign as unlisted per `docs/RELEASING.md`, install the signed build over 0.1.x, confirm your data is intact, then tag `v0.2.0` on the merge commit.

Hard stop at 80 tool calls: commit what is done, report what remains.
