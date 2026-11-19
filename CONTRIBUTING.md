# Contributing

CounterSign is a local-only Firefox extension (Manifest V3). The repository is public, so keep it free of personal data.

## Setup

1. Install Node 22.20.0 (the version in `.nvmrc`).
2. Run `npm ci`. This installs the committed lockfile exactly and runs `wxt prepare`.
3. Run `npm run dev` to start the extension in Firefox. Firefox 147 or later is required.

Add dependencies with an exact version so the lockfile stays predictable:

```sh
npm install --save-exact <package>
npm install --save-exact --save-dev <package>
```

## The gate

`npm run gate` must pass before a pull request is ready. It runs six parts in this order:

1. `npm run lint`: ESLint with zero warnings allowed, then `prettier --check .`.
2. `npm run typecheck`: TypeScript for `core/` and for the rest of the project.
3. `npm run test`: unit tests (Vitest, `unit` project).
4. `npm run build`: builds the Firefox MV3 extension into `.output/firefox-mv3`.
5. `npm run test:build`: tests against the built output (Vitest, `build` project).
6. `npm run lint:ext`: `web-ext lint` on the built output.

CI runs the same gate on every pull request and on pushes to `main`.

## Warning budgets

- ESLint: zero warnings.
- `web-ext lint`: zero errors and two warnings, the count measured when the build was set up:
  - `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: `strict_min_version` is 140.0, below Firefox for Android 142, the first version that supports `data_collection_permissions`.
  - `UNSAFE_VAR_ASSIGNMENT`: an `innerHTML` assignment inside bundled Preact.
- The warning count may not grow. If a pull request changes it, explain the change in the pull request.

## Branches and pull requests

- Never commit to `main`. Branch from `main`.
- Open a pull request for every change, including documentation changes.
- Commits and pull requests carry no AI attribution lines.
- Do not commit anything under `docs/superpowers/` or `.superpowers/`. Specs, plans and handoff notes are local planning material and are gitignored.
- Keep the gate green before you ask for review.

## Test data

- Synthetic fixtures only. Use invented company names, invented job titles, and `example.com` URLs.
- Never commit real postings, contacts, answers, personal details, exported data, or secrets.
- Fixture file names must not contain `backup` and must not start with `countersign-export-`. Those patterns are gitignored, so a fixture with such a name would be silently dropped.

## Screenshots

- `npm run shots` builds screenshots of every page in day and night mode, plus the popup, into `.shots/` (gitignored). Run the gate first, because the shots use the built extension.
- It drives Firefox. If Firefox is not on the default path, set `SHOTS_FIREFOX` to the full path of `firefox.exe` (or your platform's binary).
- A pull request that changes the look attaches the screenshots of the pages it touches, day and night. The shots use synthetic data only, so check them for anything real before attaching.

## Secrets

- Never commit credentials or `.env` files. `.env.example` lists the variable names only.
- Real values live in the shell that runs `web-ext sign`, or in an ignored `.env.local`.

## Design

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the structure and the record types.
- `core/` must stay free of DOM and `browser.*` APIs.
