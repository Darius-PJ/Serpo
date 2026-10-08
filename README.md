<p align="center">
  <img src="public/Serpo.avif" alt="Serpo" width="720">
</p>

# Serpo

A local-first, single-user CRM for a job search. Track applications through a
pipeline, keep contacts and interaction history, queue follow-ups and tasks,
source listings from over a dozen job boards, and tailor a résumé per application —
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
  gracefully without them. Keyless sources (Himalayas, Jobicy,
  Arbeitnow, RemoteOK) work out of the box.
- **Your data is yours to destroy.** Settings include a wipe-everything purge,
  and per-application contact research can be deleted without touching
  contacts you have a history with.

## Features

- **Dashboard** — a needs-attention queue (tasks, apply runs, failed automation,
  drafts, due follow-ups, new listings from saved searches), pipeline metrics
  (funnel counts, submission/interview rates, median stage age, source
  effectiveness), and a recent-activity feed.
- **Pipeline board** — drag-and-drop stages; every status change writes an
  audit event.
- **Applications** — per-application record with tasks, contacts, message
  drafts, apply runs, and a unified timeline of everything that ever happened.
- **Contacts** — reusable, company-grouped contacts with an interaction log;
  Hunter.io-powered discovery of likely decision-makers, run manually or
  automatically.
- **Auto-outreach** — submitting an application queues background contact
  discovery and an AI-drafted outreach message addressed to the best contact
  found, saved for your review. Network failures are retried. Nothing sends
  without you.
- **Sourcing** — federated job search across Adzuna, USAJobs, Jooble, Careerjet,
  the keyless boards above, and five individually selectable JobSpy boards (set up
  automatically by the one-click installer), with dedup and relevance tiers. A
  "Contract & temp only" switch asks each board that supports it for contract
  work and keeps only contract, contract-to-hire, and temporary listings.
- **Saved searches** — save any search with a cadence (daily, weekdays, or every
  6 or 12 hours) and review what it finds in its own inbox on Sourcing: Open,
  Track, or Dismiss each listing. A listing counts as new only once, even when
  it is reposted, and the Sourcing nav item shows how many are waiting.
- **Automation while Serpo is open** — with the switch on in Settings, saved
  searches re-run on their cadence in your timezone. Stale applications are
  flagged daily, and with AI assistance on, 7-day follow-up drafts are written
  for your review. Nothing runs while Serpo is closed: whatever came due runs
  once the next time it opens. Automation searches, flags, and drafts; it never
  tracks a job, applies, or sends a message.
- **Résumé workspace** — keep a template, tailor per application, export DOCX.
- **Sculpted interface** — light/dark raised surfaces and recessed controls over
  fixed patterned wallpaper. The theme button beside Local workspace switches
  light/dark mode. Settings → Appearance offers System, Full, and Reduced motion
  and shows the effective mode; both preferences stay in this browser. Full motion
  forms surfaces over 1.5 seconds, with text fading at the same rate and all effects
  starting together; the navigation rails stay still. Reduced skips the reveal;
  System follows the device's motion preference.

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
The interface blanks immediately during shutdown. If Quit fails, it returns
with an error and preserves your current inputs.
Closing the dedicated window with X also stops the session. Ordinary browser
windows are untouched. The hidden server shell exits when its managed host ends.
The app window uses installed Microsoft Edge, falling back to Chrome, with a
separate profile under `%LOCALAPPDATA%\Serpo\browser-profile`.

Sessions started with an older launcher must be closed manually, then reopened
from the updated shortcut to enable managed Quit. Servers started with
`npm run dev` are intentionally not terminated by the Quit endpoint.
Startup failures are logged in `%LOCALAPPDATA%\Serpo\launcher.log` and
`server-<port>.log`. Windowless startup errors also show a short error dialog.

### Any platform: the command line

```bash
npm run setup
npm run dev
```

Then open http://127.0.0.1:3000/dashboard.

### JobSpy setup and search behavior

JobSpy supplies Indeed, LinkedIn, ZipRecruiter, Glassdoor, and Google Jobs. Each
board has its own results, errors, cache, and cooldown; select the boards you want
in the search form. Serpo runs one JobSpy subprocess at a time. Each board gets
its full execution timeout (90 seconds by default) when dequeued, so searching
several boards can take longer than 90 seconds overall.

The supported dependency is **`python-jobspy==1.1.82`**. On Windows, provision or
repair the private Python 3.12 environment from the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setupJobSpy.ps1
```

Command-line setup (`npm run setup`) does not provision JobSpy. For a custom
Python 3.10–3.12 environment, install `python-jobspy==1.1.82` there and set
`JOBSPY_PYTHON` in `.env.local` to that interpreter's path. Before scraping, the
helper checks the version and private request-hook signatures; incompatible
environments fail with repair instructions rather than sending requests.

Board-reported failures retain protective cooldowns. Local timeouts, aborts,
setup failures, and malformed helper output do **not** trigger the 30-minute
board-failure cooldown; normal request spacing remains. Existing cooldowns
survive restarts. See [JobSpy request controls](docs/jobspy-request-controls.md)
for settings, cached-result behavior, and troubleshooting.

## Job Board Setup

Serpo searches many job boards at once. Most of them work the moment you open
the app — there is nothing to set up. Four optional boards need a quick, free
sign-up to switch on. This section walks through it in plain steps; you can do
it now or any time later, and you only ever do it once.

### What already works, with nothing to set up

These boards are on from the start — no account, no key:

- **Himalayas, Jobicy, Arbeitnow, RemoteOK** — remote-focused boards,
  always searched.
- **LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs** (via JobSpy) — if
  you installed with `Install-Serpo.cmd`, these quietly set themselves up in the
  background the first time you run the app. If you installed another way, run
  the one-time command in
  [JobSpy setup and search behavior](#jobspy-setup-and-search-behavior) above.

If that covers you, you're done — open the app and search.

### Optional boards that need a free key

Four more boards each need a short, free sign-up. They are all optional: Serpo
simply leaves out any board you haven't set up and keeps searching the rest.

| Board | What it adds | Sign up at |
| --- | --- | --- |
| **Adzuna** | A large general job aggregator (US and many other countries) | https://developer.adzuna.com/ |
| **USAJobs** | Official US federal government jobs | https://developer.usajobs.gov/ |
| **Jooble** | A broad "aggregator of aggregators"; instant sign-up, no card | https://jooble.org/api/about |
| **Careerjet** | A worldwide aggregator that also returns contract and temp work | https://www.careerjet.com/partners/api |

### How to add a key

Every key goes in one file called **`.env.local`**, which lives in Serpo's
folder (the folder created when you installed — for the installer, that's inside
your Documents folder). Setup already created this file for you. To add a key:

1. Open the Serpo folder and find the file named **`.env.local`**. (If Windows
   hides file extensions, it may appear simply as `.env`.)
2. Open it with a plain text editor — **Notepad** is fine: right-click the file,
   choose **Open with**, then **Notepad**.
3. Find the line for your board (for example `ADZUNA_APP_ID=`) and type or paste
   the value right after the `=`, with no spaces and no quotation marks:

   ```
   ADZUNA_APP_ID=your-application-id
   ADZUNA_APP_KEY=your-application-key
   ```
4. **Save** the file, then **close and reopen Serpo**. The newly set-up boards
   are now included in every search.

Keep this file to yourself — it holds your personal keys. Serpo never sends it
anywhere; it stays on your machine and is kept out of version control.

### Where each key comes from

- **Adzuna** — Register at https://developer.adzuna.com/, then open your API
  dashboard. It shows an **Application ID** and an **Application Key**. Put them
  on the `ADZUNA_APP_ID=` and `ADZUNA_APP_KEY=` lines.
- **USAJobs** — Request a key at https://developer.usajobs.gov/ (they email it
  to you). Put the key on `USAJOBS_API_KEY=` and the **email address you signed
  up with** on `USAJOBS_USER_AGENT=` — USAJobs needs both to answer.
- **Jooble** — Sign up at https://jooble.org/api/about. It's instant and asks
  for no card. Copy the key onto `JOOBLE_API_KEY=`.
- **Careerjet** — Apply for a free publisher key at
  https://www.careerjet.com/partners/api. The form asks you to name a website
  and to list the public IP address(es) this computer searches from (up to 8 —
  search "what is my IP" in a browser to find yours). Put the key on
  `CAREERJET_API_KEY=`.

Two other optional features use the same `.env.local` file in the same way: AI
assistance (an Anthropic/Claude key) and automatic contact discovery (a free
Hunter.io key). They are not job boards, but if you want them, the comments next
to each line in `.env.local` explain what to paste.

## Development

Built with Next.js (App Router), Prisma + better-sqlite3, Tailwind CSS,
Vitest, and Playwright.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a map of the codebase —
layers, key modules, cross-cutting concerns, durable state, and how the scripts
and launch lifecycle fit together.

- `npm run verify` — the full release gate: lint, typecheck, deployment-config
  check, production build, unit tests, script tests, e2e tests. CI runs the same steps.
- `npm run test:unit` / `npm run test:scripts` / `npm run test:e2e` — the suites individually.
  The e2e suite needs browsers once: `npx playwright install`.
- `npm run db:upgrade-and-verify` — applies pending hand-written SQL
  migrations to the live database, fail-closed: each migration is replayed
  against an in-memory copy and schema-fingerprinted before it touches
  `data/app.db`, and a timestamped backup is taken first.

Migrations are hand-written SQL under `prisma/migrations/` (no
`prisma migrate dev`); the schema in `prisma/schema.prisma` is the source of
truth for the generated client.
