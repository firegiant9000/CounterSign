# Countersign

A local-only Firefox extension that records your job applications, what you sent each company, and the answers you give again and again.

[![CI](https://github.com/firegiant9000/CounterSign/actions/workflows/ci.yml/badge.svg)](https://github.com/firegiant9000/CounterSign/actions/workflows/ci.yml)

> **Status:** v1.0.0. It is not published to the Firefox add-on store; build it from source (see [Build and run](#build-and-run)). Firefox 140 or later only.

## The three claims

- **Local only.** All data stays on your machine. The extension makes no network requests.
- **Nothing reads a page until you click.** It has no content scripts. It reads the current tab only after you click the toolbar button or press Alt+Shift+S by default. The one thing that runs without a click is the local automatic backup check.
- **It never submits anything.** It does not fill forms, apply for jobs or send data anywhere.

## How the claims are enforced

Each claim is checked by the gate (`npm run gate`), which CI also runs.

| Claim                                | How it is enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local only                           | [`guard/build.test.ts`](guard/build.test.ts) scans every built `.js` and `.html` file for network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `WebTransport`, `RTCPeerConnection`), checks that no built page loads a remote `src` or `href`, and asserts the manifest has no host permissions. [`eslint.config.js`](eslint.config.js) bans the same APIs in source (`no-restricted-globals`, `no-restricted-properties`, `no-restricted-syntax`). The Content Security Policy in [`wxt.config.ts`](wxt.config.ts) sets `default-src 'self'; ... connect-src 'none'`. |
| Nothing reads a page until you click | [`guard/build.test.ts`](guard/build.test.ts) asserts the built manifest declares no content scripts and no web-accessible resources. The permissions are listed below. The background event page runs only the local automatic backup check (on startup, install, a daily alarm and backup-counter changes) and never reads a tab ([`entrypoints/background.ts`](entrypoints/background.ts)).                                                                                                                                                                                                        |
| It never submits anything            | There is no code path that sends a request (see the first row), the manifest has no host access, and the CSP sets `form-action 'none'`, so a form on an extension page cannot post anywhere. The test asserts the exact CSP in the built manifest.                                                                                                                                                                                                                                                                                                                                                   |

Files are saved only through [`shell/files/download.ts`](shell/files/download.ts), which builds a local `blob:` URL. A lint rule in [`eslint.config.js`](eslint.config.js) rejects any other use of `downloads`, and [`guard/source-rules.test.ts`](guard/source-rules.test.ts) tests that rule.

<!-- Screenshot pending (Task 20): take it from the synthetic demo data (Data page, "Load demo data"), save it as docs/screenshots/applications.png, then restore this line:
![The applications list, showing synthetic demo data](docs/screenshots/applications.png)
-->

## What it does today

Stage 1 is the dashboard. Stage 2 adds saving a job from the page you are on, plus quiet, deadlines, contacts and copy tools. Stage 3 adds follow-ups, an interview pack, a story bank, a weekly review and targets. Everything is still your own data, stored locally.

- **Applications list** with search, filters, manual entry, and a next-action date and who acts next.
- **Save a job.** After you click the toolbar button (or press Alt+Shift+S by default; you can rebind it in about:addons), the popup reads the current tab once and offers the job for saving. Nothing is read before the click.
- **Duplicate and repost facts.** When a job matches an application you already have, the popup says so ("already applied" or "possible match"). It also states the fact when you saved the same posting earlier, without judging it.
- **Automatic backup.** Countersign saves `Countersign/countersign-backup.json` to your downloads folder, and the dashboard shows how old the last backup is. The backup file holds all your data, including your details and contacts, as plain text, so keep your downloads folder out of cloud sync if that matters to you.
- **What I told them.** Per application, record the answers you gave. A warning appears when one differs from your canonical answer.
- **Quiet list** (`#/quiet`) of applications with no response for a set number of days (a setting). You can close several at once.
- **Formhand log.** On an application, record the application site type and how filling went. You enter it by hand.
- **Contacts** (`#/contacts`) with a log of reaching out, replies and referrals. The popup and the application page ask "anyone here?" and let you record that you checked and nobody was there.
- **Deadlines** (`#/deadlines`): open tasks, next-action dates and quiet applications on one list, dated rows first.
- **My details** (`#/details`): 12 profile fields (name, email, phone, address, links) and your canonical answers, each with a copy button. Copying uses a click only, and nothing is typed into a page.
- **Application detail** with a status history. Entries can be backdated, and a mistaken status can be undone without deleting history.
- **Resume and cover-letter records.** You attach a file to record which one you sent. Countersign stores the file name and a SHA-256 hash, not the file.
- **Canonical answers** (for example work authorisation or salary range), each with its history of earlier values.
- **Export and restore.** Export saves all data and settings to a JSON file. Restore checks the file first and saves a pre-restore copy of your current data (if there is any) before replacing it. A file that fails validation leaves your data untouched.
- **Follow-ups.** The contact activity log lets you undo an entry (it is hidden, not deleted). Each contact has one follow-up date, and an application takes at most two follow-ups. Follow-up dates and interview rounds also appear on the Deadlines list.
- **Interview pack.** On an application page, record interview rounds (kind, date, time, interviewers, notes) and a debrief for each. "Interview pack" opens a printable page (`#/pack/<id>`) with the posting, your statements and any unresolved mismatches.
- **Story bank** (`#/stories`): situation, task, action and result for each story, searchable by tag.
- **Weekly review** (`#/weekly`): this week's and last week's counts (outreach, conversations, applications, follow-ups) and your plan. Going over your application cap shows a note, not a limit.
- **Targets** (`#/targets`): flag companies you most want to work at, here or from Contacts.
- **Demo data.** A synthetic data set so you can try it without typing in your own.

## Moving from a spreadsheet

A local command turns two CSV exports of a job-tracker sheet into a Countersign export file. It makes no network requests and never overwrites a file.

```
npm run import-sheet -- --applications <csv> --history <csv> --out <folder> [--undated-on YYYY-MM-DD] [--dry-run]
```

1. Remove any demo data. Enter nothing real yet, including canonical answers: Restore replaces every store and the settings.
2. Download both sheet tabs ("Applications" and "Response History") as CSV into a folder outside the repository.
3. Run the command with `--dry-run` and read the report. Fix the sheet, or ask for a mapping change, until the report is acceptable. Rows with no date need `--undated-on <date>`.
4. Run it without `--dry-run`, then use Data → Restore on the file it wrote.
5. Check the application count against the sheet and spot-check about ten rows, including one employer-closed row and one unconfirmed row.
6. Export from Countersign straight away and keep the file somewhere safe.
7. Keep the sheet as a read-only archive. Countersign saves `Countersign/countersign-backup.json` in your downloads folder after every 25 changes or once a week, and the dashboard shows how old it is; export by hand before anything risky.

The report prints cell values from your sheet, so do not paste it into public issues or pull requests.

Sheet status values map to Countersign statuses like this (matching ignores case and extra spaces):

| Sheet value          | Countersign status                                                |
| -------------------- | ----------------------------------------------------------------- |
| Applied              | Applied                                                           |
| Rejected             | Rejected                                                          |
| Closed               | Position closed                                                   |
| Phone Screening      | Phone screen                                                      |
| Technical Assessment | Phone screen                                                      |
| Interviewing         | Interview                                                         |
| Not submitted        | Interested, with a note that the submission is not confirmed      |
| Awaiting response    | No change: keeps the previous status, and is listed in the report |
| Needs review         | No change: keeps the previous status, and is listed in the report |

Any other value is not imported and appears under "Skipped" in the report.

## What is next

After version 1, in this order:

1. Recruiter-email status button: clicked while an email is open, it suggests a status change. No mailbox login, no filing of email threads.
2. Resume profiles: several resume variants. Canonical answers stay global.
3. Own form filling, review-first, if the Formhand log justifies it. Workday first.
4. Story bank: who heard which story.
5. Application windows on target companies.
6. A dated activity export.

None of these exists yet.

## What it will never do

The tool has failed if it does any of these:

- Submit or auto-apply anything, or type into a page without a click.
- Send any data anywhere, including telemetry and error reports.
- Require an account or a server.
- Write application answers with AI, score "fit", or label a posting as fake or a ghost job.
- Show rejection tallies, streaks or other numbers that punish you by default.
- Force a tutorial, or inject overlays into pages.

## Permissions

These are the permissions the built manifest contains today. The build test ([`guard/build.test.ts`](guard/build.test.ts)) asserts exactly these six. There is no `tabs` permission and no host access.

| Permission         | Why                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `unlimitedStorage` | Keeps the IndexedDB database from being evicted or capped by the browser.                      |
| `storage`          | Saves settings (such as your status labels) in `storage.local`.                                |
| `downloads`        | Saves export files and the pre-restore copy to your Downloads folder.                          |
| `activeTab`        | Reads the current tab only after you click the toolbar button or press Alt+Shift+S by default. |
| `scripting`        | Runs the capture script on that tab.                                                           |
| `alarms`           | Runs a daily check for a due backup.                                                           |

Copy buttons use `navigator.clipboard.writeText` from a click ([`shell/clipboard.ts`](shell/clipboard.ts)), so no `clipboardWrite` permission is needed.

The popup's "Open dashboard" button finds an already open dashboard tab with `runtime.getContexts` where available, otherwise it opens a new tab. This needs no `tabs` permission ([`shell/open-dashboard.ts`](shell/open-dashboard.ts)). The manifest also declares `data_collection_permissions` as `none`.

## Build and run

You need Node 22.20.0 (see `.nvmrc`) and Firefox.

```sh
npm ci
npm run dev
```

`npm run dev` starts the extension in Firefox. The dev build has no CSP, so check changes in the built extension too.

`npm run gate` runs lint, typecheck, unit tests, the build, the build tests and `web-ext lint`. On `main` at `70d7a22` (2026-11-16) CI passed 619 unit tests in 36 files and 14 build tests. To load a build by hand, run `npm run build`, open `about:debugging#/runtime/this-firefox`, choose "Load Temporary Add-on" and select `.output/firefox-mv3/manifest.json`.

The extension runs on Firefox 140 or later (`strict_min_version`). To run it from source, see [CONTRIBUTING.md](CONTRIBUTING.md).

## More

- [Architecture](docs/ARCHITECTURE.md)
- [Releasing](docs/RELEASING.md)
- [Contributing](CONTRIBUTING.md)
- Licence: MIT. See [LICENSE](LICENSE).
