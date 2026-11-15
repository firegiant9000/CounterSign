# Countersign: design

Date: 2026-11-13. Status: approved by the owner on 2026-11-14.

Lines marked **(call)** are the spec author's decisions, accepted by the owner with the rest of the spec.

## 1. Intent

Countersign is a personal, local-first browser extension that helps one person run a job search: it records every application, what was sent, what was said to each company, who they know there, and what is due next.

Why it exists:

- Existing tools (Simplify and similar) run on every page, need an account, send data to a server, and fill forms with wrong answers. The owner stopped using them.
- The evidence gathered before this spec says offers come through people and targeted applications, not through volume or autofill. So the tool spends its effort on contacts, a faithful record and interview preparation, and treats form filling as a later extra.
- People abandon trackers because of upkeep and mood. So saving must be one click, almost every field is optional, and discouraging numbers stay out of sight unless asked for.

It is also a public portfolio project, so the code, tests and privacy posture must stand up to reading by a stranger.

## 2. Goals, non-goals, anti-goals

**Goals**

- Usable on real applications after the first build stage (section 11), and at every stage after.
- All data stays on the user's machine. The extension makes no network requests at all.
- Nothing runs on a web page until the user clicks the toolbar button or presses the hotkey.
- Data survives: export, restore and automatic backup exist before features that create a lot of data.
- Works in Firefox first (Manifest V3). Edge and Chrome are a second target that the build must not rule out; a Chromium build is not tested or shipped in version 1 **(call)**.

**Non-goals for version 1**

- Filling forms. The open-source extension Formhand is used for that meanwhile; Countersign only logs how it went per site (section 6.2).
- Reading email. A recruiter-email status button comes after version 1.
- Several resume profiles. Version 1 records which resume was sent; profiles come later.
- Multi-user, sync between machines, mobile.

**Anti-goals: the tool has failed if it does any of these, even if it works**

- Submits or auto-applies anything, or types into a page without a click.
- Sends any data anywhere, including telemetry and error reports.
- Requires an account or a server.
- Writes application answers with AI, scores "fit", or labels a posting as fake or a ghost job.
- Shows rejection tallies, streaks or other numbers that punish the user by default.
- Forces a tutorial, or injects overlays into pages.
- Takes more of the owner's week than outreach and applications do.

## 3. Constraints

- Firefox Manifest V3. The background context is an event page and must hold no state in memory.
- Node 22.20.0 on the build machine. The builder must confirm the chosen tool versions support it and pin them.
- No AI features and no AI dependencies in version 1.
- Written from scratch. Competitor extensions were studied for ideas only; none of their code, configuration or keys may be copied.
- Public repository: synthetic fixtures only; no real postings, contacts or answers; exported backups are gitignored.
- Package manager: npm with a committed lockfile **(call)**.

## 4. Approaches considered

**A. One extension: a framework-free core library plus a thin browser shell (chosen).**
A `core/` TypeScript package holds the schema, migrations, repository interface and all rules, and imports nothing from `browser.*`. A thin shell supplies the IndexedDB storage, the toolbar popup, the page capture and the dashboard, which is an ordinary extension page. Trade-off: slightly more structure up front. In return the rules are testable with plain unit tests, the browser-specific surface is small, and a Chromium build is mostly configuration.

**B. A local web app plus a small capture extension.**
The dashboard would be a normal web page (installed as an app), with a tiny extension only to save postings. Trade-off: easier UI development, but two things to install and keep in step, messaging between them, and browser storage for a web origin is easier to lose than extension storage. Rejected.

**C. A content-script extension with in-page panels, as the market leaders do.**
Trade-off: the most convenient at the moment of applying, but it needs permission for every site and runs on every page, which is the loudest complaint about the tool this replaces. Rejected.

The owner picked A, accepting the recommendations of an earlier engineering review, including the WXT build framework.

## 5. Architecture

- **Build:** WXT with TypeScript, targeting Firefox MV3 first. The builder confirms the exact Firefox MV3 build flag and the WXT version against current WXT documentation.
- **`core/`:** entity types, schema version, forward-only migrations, a repository interface, and pure functions for derived values (current status, deadlines, duplicate and repost checks, mismatch checks, weekly counts, follow-up limits). No `browser.*`, no DOM, no network.
- **Shell:**
  - *Storage adapter:* IndexedDB behind the repository interface, using the small `idb` wrapper **(call)**. `storage.local` holds settings only.
  - *Toolbar popup:* the save-job flow (section 6.3).
  - *Capture script:* injected into the active tab by `scripting.executeScript` only after a click or hotkey; returns data and exits.
  - *Dashboard:* one extension page with all other screens. Built with Preact and plain CSS **(call)**: small, and keeps the bundle easy to audit.
  - *Event page:* handles the hotkey and the backup alarm. Reads everything it needs from storage each time it wakes.
- **Permissions:** `activeTab`, `scripting`, `storage`, `downloads`, `alarms`. No host permissions and no `content_scripts` entry in the manifest. The builder checks whether `unlimitedStorage` is needed to keep IndexedDB from being evicted in Firefox and adds it only if so.
- **No network, enforced twice:** the extension-page content security policy sets `connect-src 'none'` **(call)**, and a test fails the build if the bundle contains network calls or the manifest gains host permissions (section 9).
- **Identity and signing:** a fixed `browser_specific_settings.gecko.id` from the first build; `data_collection_permissions` declares no data collection; builds are signed as unlisted through Mozilla with `web-ext sign`. Signing credentials live in environment variables, never in the repo.

## 6. Features in version 1

Priority order. Everything except `id` and `createdAt` is optional on every record.

### 6.1 Locked answers and "what I told them"

- A list of canonical answers to knockout questions: work authorization, sponsorship, salary range, earliest start date, relocation, reason for leaving. Each has a type (yes/no, choice, money range, date, free text) and keeps its edit history.
- Each application has "what I told them" entries (salary named, start date, and any other answer the user wants to record). A new entry is pre-filled from the canonical answer and can be edited.
- Mismatch warning (in version 1 at the owner's request; no user research asked for it). When an entry is saved, it is compared with the canonical answer by type:
  - yes/no and choice: warn if they differ;
  - money: warn if the figure named falls outside the canonical range;
  - date: warn if the date told is earlier than the canonical earliest date;
  - free text: no automatic judgement; the two are shown side by side.
- A warning never blocks saving. It offers two actions: "update canonical" (changes the canonical answer and adds to its history) or "keep as exception" (marks the entry as deliberate, and the warning goes away). Unresolved warnings show on the application and in its interview pack.

### 6.2 Tracker

- An application belongs to a company and, usually, a saved job. Its status history is append-only; the current status is the latest event.
- Default statuses **(call)**: Interested, Applied, Recruiter contact, Phone screen, Interview, Offer, Accepted, Rejected, Position closed, No response, Withdrawn. Accepted, Rejected, Position closed, No response and Withdrawn are closed (archived) statuses. Each is a stable key with an editable label. Adding new statuses is not in version 1.
- Fields: next-action date, who acts next (me or them), which resume was sent (a link to a document record: label, file name, hash; the file itself is not stored), cover letter sent (same), notes.
- Formhand log **(call on shape)**: optional fields for the application site type (Greenhouse, Lever, Ashby, Workday, LinkedIn, Indeed, other) and how filling went (worked, partly, failed, not used) with a note. This is the evidence for whether Countersign ever builds its own filling.
- "No response" is separate from "Rejected". A setting holds a cut-off in days, default 30 **(call)**. Applications still at Applied with no later event past the cut-off appear in a "quiet for N days" list where the user can close them as No response, one at a time or selected together. Nothing is closed automatically.
- Closed applications are archived, never deleted by status change. Deleting is a separate, confirmed action.
- Search by company, title and notes; filter by status and by archived or active.

### 6.3 Save job

- Trigger: toolbar button or hotkey (default `Alt+Shift+S` **(call)**, rebindable through the browser). The hotkey is bound to the `_execute_action` command, so it opens the same popup as the button and both paths show the same feedback **(call)**.
- The capture script runs in the page; the popup injects it into the active tab and receives the result.
- The popup opens and captures at once, in this order: a JSON-LD `JobPosting` on the page; otherwise the user's current text selection; otherwise a box to paste the text. No per-site extractors.
- Stored as an immutable snapshot: title, company, location, URL, canonical URL (the page's `rel=canonical` if present, otherwise the URL with tracking parameters and fragment removed), posting text, capture time.
- The popup then shows what was saved, plus:
  - "Already applied here" if an application exists for the same canonical URL; "possible match" if company and title match under a different URL.
  - A repost fact if an earlier snapshot of the same canonical URL, or the same company and title, exists: "You saved this posting on 12 June (5 months ago)." Facts only, never a judgement about the posting.
  - The "anyone here?" prompt (section 6.4).
- One click saves. Creating an application from the saved job is a second, optional click.

### 6.4 Contacts and follow-ups

- Contacts belong to a company: name, role, how the user knows them, notes. Interviewers are contacts.
- Contact events are append-only: reached out, replied, referred, followed up, call held.
- "Anyone here?": when a job is saved or an application is created, show the contacts at that company. If there are none, ask once per company whether the user knows anyone, with "add a contact" and "checked, nobody" as answers.
- A contact event may reference an application (optional). The follow-up limit and the weekly follow-up count use that link **(call)**.
- Follow-up dates per contact. At most two follow-ups per contact per application; after the second, the tool offers no further follow-up date.

### 6.5 Interview pack

One page per application that gathers: the saved posting, the resume and cover letter records, the projects that company was shown (free text), "what I told them", contacts, rounds (date, type, interviewers, notes) and a debrief form per round (what was asked, what went well, what to change, stories used as free text). It has a print-friendly layout.

### 6.6 Story bank

A library of behavioural stories: title, situation, task, action, result, and tags for the competencies each shows. Searchable by tag. Recording who heard which story is deferred.

### 6.7 Deadlines and next actions

One list, sorted by date, derived from: application next-action dates, follow-up dates, interview rounds, the "quiet for N days" list, and free-form tasks. Only free-form tasks are stored; the rest are computed. Each row shows who acts next.

### 6.8 Weekly review and plan

- Four counts for the week **(call; the earlier notes say "four process counts" without naming them)**: outreach messages sent, conversations held, applications sent, follow-ups sent.
- The counts are computed from contact events and status events, never typed in. A week starts on Monday in local time. Only the plan is stored **(call)**.
- A plan for next week: an outreach target and a cap on applications. The user sets the cap, and can exceed it; going over shows a note, not a block. No cap is set by default.
- Hidden by default, one click to show: totals to date, and a line showing the furthest stage each application reached.
- Never shown: rejection tallies, streaks.

### 6.9 Target companies

A flag on a company, and a view listing flagged companies with their contacts and any saved jobs. No application windows in version 1.

### 6.10 "Copy my details" panel

A dashboard panel listing the user's details (name, email, phone, full address in separate parts, links) and the canonical answers, each with a copy button. This stands in for form filling.

### 6.11 Export, restore and backup

- Export: one JSON file containing every record and the schema version.
- Restore: validates the file, migrates it forward if it is older, and replaces all current data after a confirmation; it first saves an export of the current data under a timestamped file name, so it can never overwrite the automatic backup **(call: replace, not merge)**.
- Automatic backup: `downloads.download` to a fixed file name inside a `Countersign` subfolder of the downloads folder, with `conflictAction: "overwrite"`, on a weekly alarm and after every 25 writes **(call)**. The browser's normal download indicator will show each time; that is accepted **(call)**. The write counter lives in `storage.local` and is incremented by the storage adapter, so writes made from the dashboard count and the event page needs no memory. The dashboard shows "last backup N days ago" and warns past 14 days.

## 7. After version 1, in order

1. Recruiter-email status button: clicked while an email is open, suggests a status change. No mailbox login, no filing of email threads.
2. Resume profiles: several resume variants. Canonical answers stay global.
3. Own form filling, review-first, if the Formhand log justifies it. Workday first.
4. Story bank: who heard which story.
5. Application windows on target companies.
6. A dated activity export.

**Excluded outright:** auto-apply or auto-submit, AI-written answers, fit scores, ghost-job verdicts, telemetry, accounts, any server, detailed education modelling, onboarding tutorials, in-page overlays, filing email threads, a references ledger.

## 8. Data model

Entities (only `id` and `createdAt` required on each):

| Entity | Purpose |
|---|---|
| Company | Name, `isTarget`, "anyone here?" answer |
| Job | Immutable posting snapshot |
| Application | Links company and job; next action, who acts next, documents sent, site type, fill outcome |
| StatusEvent | Append-only; current status is derived |
| Contact | Person at a company, including interviewers |
| ContactEvent | Append-only outreach and follow-up history |
| Round | Interview round with debrief |
| Story | Behavioural story |
| CanonicalAnswer | Typed answer with history |
| Statement | "What I told them" for one application, with a "deliberate exception" flag |
| Task | Free-form to-do with a date |
| Document | Label, file name, hash; no file contents |
| ProfileField | The user's details for the copy panel **(call)** |
| WeeklyReview | The plan for one week; counts are computed |

A schema version is stored with the data. Migrations are forward-only and each has a test.

## 9. Testing and the gate

- Vitest on `core/`: derived status, deadlines, duplicate and repost checks, follow-up limit, weekly counts, quiet-application list, mismatch check for each answer type.
- 5 to 8 synthetic HTML fixtures for capture (JSON-LD present, malformed, absent; selection; canonical link variants).
- One test per migration, plus an export-then-restore round trip.
- Privacy guard, three parts **(call)**: a lint rule bans `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` in the project's own source; a test fails if the built manifest contains host permissions or content scripts, or lacks the `connect-src 'none'` policy; and a text scan of the built bundle for the same names, with a short reviewed allowlist for strings inside dependencies.
- `web-ext lint` on the build.
- GitHub Actions runs all of the above on every pull request. No browser automation tests yet.
- **The gate:** lint, typecheck, unit tests, privacy guard, build and `web-ext lint` all pass.

## 10. Repository hygiene

- Public from the first push. The README leads with: local only, nothing runs until you click, never submits.
- `.gitignore` covers exported backups, signing credentials and the untracked handoff folder `docs/superpowers/prompts/`.
- Work happens on branches with pull requests; nothing is committed straight to `main` after the initial commit.
- Actions are pinned by commit SHA **(call)**.

## 11. Build sequence

Each stage ends with something used on real applications.

- **Stage 1 (about 6 hours):** core schema and storage; applications page with status history, next-action date, who acts next and which resume; canonical answers list; JSON export and restore. Applications are entered by hand at this stage (company name, title, URL), and the company record is created inline **(call)**.
- **Stage 2 (to about 20 hours):** save job with duplicate warning and repost fact; automatic backup; "what I told them" with the mismatch warning; quiet-application list; deadlines view; simple contacts with "anyone here?"; copy panel.
- **Stage 3 (to about 40 hours):** follow-up tracking; interview pack; story bank; weekly review; target companies.

## 12. Process guardrails (set by the owner, 2026-11-14)

- At most 12 hours a week spent building the tool, so that outreach and applications come first.
- A check-in at week 6: if the tool is not in use on real applications by then, the owner reviews whether to continue. It is a review, not an automatic stop.

## 13. Left to the builder

- Screen layout and visual design of the dashboard and popup, within "plain, fast, no tutorial".
- Exact field names, index design and IndexedDB store layout.
- The list of tracking parameters stripped for canonical URLs.
- Lint and formatting configuration (2-space indentation).
- How the event page counts writes for the backup trigger.
- Exact versions of WXT, Preact, `idb`, Vitest and `web-ext`, pinned, after checking Node 22.20.0 support.
