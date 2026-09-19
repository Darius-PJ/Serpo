<p align="center">
  <img src="public/Serpo.avif" alt="Serpo" width="720">
</p>

# Serpo

A local-first, single-user CRM for a job search. Track applications through a
pipeline, keep contacts and interaction history, queue follow-ups and tasks,
source listings from a dozen job boards, and tailor a résumé per application —
all on your own machine.

## Privacy by design

- **Everything stays local.** The entire dataset lives in one SQLite file
  (`data/app.db`), which is git-ignored along with its backups and résumé
  artifacts. The dev and production servers bind to `127.0.0.1` only.
- **No accounts, no login.** This is a deliberately password-free single-user
  workspace. Deployment validation fails closed if you try to configure it for
  public hosting.
- **Integrations are opt-in.** AI assistance (Claude) and keyed job-search APIs
  activate only when you add keys to `.env.local`; every feature degrades
  gracefully without them. Keyless sources (Remotive, Himalayas, Jobicy,
  Arbeitnow, RemoteOK) work out of the box.
- **Your data is yours to destroy.** Settings include a wipe-everything purge,
  and per-application contact research can be deleted without touching
  contacts you have a history with.

## Features

- **Dashboard** — a needs-attention queue (tasks, apply runs, drafts, due
  follow-ups), pipeline metrics (funnel counts, submission/interview rates,
  median stage age, source effectiveness), and a recent-activity feed.
- **Pipeline board** — drag-and-drop stages; every status change writes an
  audit event.
- **Applications** — per-application record with tasks, contacts, message
  drafts, apply runs, and a unified timeline of everything that ever happened.
- **Contacts** — reusable, company-grouped contacts with an interaction log;
  Hunter.io-powered discovery of likely decision-makers, run manually or
  automatically.
- **Auto-outreach** — submitting an application kicks off background contact
  discovery and an AI-drafted outreach message addressed to the best contact
  found, saved for your review. Nothing sends without you.
- **Sourcing** — federated job search across Adzuna, USAJobs, Jooble, the
  keyless boards above, and JobSpy (set up automatically by the one-click
  installer), with dedup and relevance tiers.
- **Résumé workspace** — keep a template, tailor per application, export DOCX.

## Getting started

The only prerequisite is [Node.js](https://nodejs.org) 20.9 or newer — the
one thing setup cannot install for you (it will tell you if it's missing).
Clone or download this repository, then pick either path below. Both run the
same first-run setup: it installs npm packages, generates the Prisma client,
copies `.env.example` to `.env.local` (every key in it is optional), and
creates the SQLite database — or fail-closed verifies and upgrades an
existing one, with an automatic backup. Setup only does the missing work, so
it is safe to run again any time, e.g. after `git pull`.

### Easiest: the installer

If someone sent you `Install-Serpo.cmd`, that one file is the whole
install: double-click it and it puts the app in your Documents folder, gets
Node.js if your machine has none (app-private, nothing installed
system-wide), creates a desktop shortcut, and starts up — while the JobSpy
job source (LinkedIn/Indeed/Glassdoor/ZipRecruiter/Google) sets itself up in
the background. You need nothing else. (Maintainers build it with
`npm run build:installer`.)

### Windows: double-click

Double-click `Serpo.vbs` or use the Serpo desktop shortcut. It installs
anything missing, finds a free port, and opens a dedicated Serpo window with
the server running in the background. No PowerShell window stays visible.
`Serpo.cmd` also hands off to this hidden launcher, although Windows may briefly
show its initial command window. To create or update the desktop shortcut, run
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/createShortcut.ps1`.

**Quit**, at the bottom of the left rail, closes Serpo's dedicated browser window
and stops its owned Node server tree (including in-flight JobSpy subprocesses).
Closing the dedicated window with X also stops the session. Ordinary browser
windows are untouched. The hidden server shell exits when its managed host ends.
The app window uses installed Microsoft Edge, falling back to Chrome, with a
separate profile under `%LOCALAPPDATA%\Serpo\browser-profile`.

Existing sessions started before this update must be closed once manually.
Relaunch from the updated shortcut to enable managed Quit. Servers started with
`npm run dev` are intentionally not terminated by the Quit endpoint.
Startup failures are logged in `%LOCALAPPDATA%\Serpo\launcher.log` and
`server-<port>.log`. Windowless startup errors also show a short error dialog.

### Any platform: the command line

```bash
npm run setup
npm run dev
```

Then open http://127.0.0.1:3000/dashboard.

## Development

Built with Next.js (App Router), Prisma + better-sqlite3, Tailwind CSS,
Vitest, and Playwright.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a map of the codebase —
layers, key modules, cross-cutting concerns, durable state, and how the scripts
and launch lifecycle fit together.

- `npm run verify` — the full release gate: lint, typecheck, deployment-config
  check, production build, unit tests, e2e tests. CI runs the same steps.
- `npm run test:unit` / `npm run test:e2e` — the test suites individually.
  The e2e suite needs browsers once: `npx playwright install`.
- `npm run db:upgrade-and-verify` — applies pending hand-written SQL
  migrations to the live database, fail-closed: each migration is replayed
  against an in-memory copy and schema-fingerprinted before it touches
  `data/app.db`, and a timestamped backup is taken first.

Migrations are hand-written SQL under `prisma/migrations/` (no
`prisma migrate dev`); the schema in `prisma/schema.prisma` is the source of
truth for the generated client.
