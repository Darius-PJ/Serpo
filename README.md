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

**Choose one setup method — you do not need to do both.**

- **Windows desktop app:** use the [Windows installer](#windows-installer-recommended).
- **No installer, or prefer a terminal?** Use [manual setup from source](#manual-setup-from-source).

API keys are optional. You can install Serpo and start using it without them.

### Windows installer (recommended)

**You need:** 64-bit Windows, an internet connection for setup, and Google Chrome
or Microsoft Edge installed.

**You do not need to install Node.js first.** The installer uses the required
Node version if it is already available, or downloads a checksum-verified,
private copy for Serpo. It does not replace your system-wide Node installation.

1. Get **`Install-Serpo.cmd`** from the project's
   [Releases page](https://github.com/Darius-PJ/Serpo/releases), if an installer
   is listed, or use the copy supplied by the maintainer. This is a separately
   built file, **not part of GitHub's source ZIP**. If you do not have it, follow
   [manual setup](#manual-setup-from-source) instead.
2. **Double-click `Install-Serpo.cmd`.** Leave its setup window open while it
   downloads dependencies and prepares the app. First-time installation can take
   several minutes.
3. **Wait for Serpo to open.** The installer puts the app in a `Serpo` folder
   inside Documents, creates a desktop shortcut, and starts the app for you.
   You do not need to run any terminal commands afterward to start using it.

You can start searching Himalayas, Jobicy, Arbeitnow, and RemoteOK without keys.
The installer also starts optional JobSpy setup in the background; its additional
boards become available after that setup succeeds. See
[Job Board Setup](#job-board-setup) when you want to add other providers.

#### Opening and closing Serpo after installation

- **Open:** use the **Serpo desktop shortcut**. If the shortcut was not created,
  open the installed Serpo folder inside Documents and double-click **`Serpo.vbs`**.
  The launcher starts the background server and opens the app window for you.
  Do not run the installer again just to open Serpo.
  A startup window shows the current dependency, database, build, and server
  checks with elapsed time. First launch or an update may take several minutes;
  unchanged launches reuse cached packages and production output.
  You can minimize this window; **X minimizes rather than cancelling setup**.
  It closes automatically when Serpo is ready.
- **Close:** choose **Quit** at the bottom of the left rail, or close the dedicated
  app window with **X**. Both stop the app's background server and its in-flight
  JobSpy searches. Your ordinary browser windows are not closed.

Quit blanks the interface during shutdown. If shutdown fails, the app shows an
error and restores your current inputs.

<details>
<summary>Windows launch details and troubleshooting</summary>

The app uses installed Chrome, falling back to Edge, with a separate profile at
`%LOCALAPPDATA%\Serpo\browser-profile`. The launcher chooses an available local
port; no terminal needs to stay open.

`Serpo.cmd` is another way to open the same launcher, but Windows may briefly
show its initial command window. To create or repair the desktop shortcut, open
a terminal in the installed Serpo folder and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/createShortcut.ps1
```

Startup failures stay visible in the startup window with error details.
**View logs** opens `%LOCALAPPDATA%\Serpo`, containing `launcher.log` and
`server-<port>.log`. Close the failure window after reading it. If the startup
window itself cannot run, the shortcut falls back to a short error dialog.

</details>

### Manual setup (from source)

Use this alternative if you do not have the Windows installer, want to run
Serpo from a terminal, or are using macOS or Linux. It does not create a desktop
shortcut or automatically open an app window.

1. **Install [Node.js](https://nodejs.org) 24 LTS**, version **24.18.0 or later
   within the 24.x series**. Node 20 is not supported. Node includes `npm`, the
   command used below. Unlike the Windows installer, this method requires you
   to install Node yourself.
2. **Download the source and extract it.** On this repository's GitHub page,
   choose **Code → Download ZIP**, then extract the ZIP. Open a terminal in the
   extracted folder that contains `package.json`, not its parent folder.
   On Windows, open that folder in File Explorer, type `cmd` in the address
   bar, and press Enter to open Command Prompt there.
3. **Prepare the app** by running:

   ```sh
   npm run setup
   ```

   This downloads dependencies, creates the local configuration and database,
   and prepares the production app. You do not need to create `.env.local` or
   add API keys yourself.
4. **Start Serpo** from the same folder:

   ```sh
   npm start
   ```

   Wait for the server to be ready, then open
   **http://127.0.0.1:3000/dashboard** in your browser. Keep this terminal open
   while you use Serpo.

**To stop:** press **Ctrl+C** in that terminal. Closing the browser tab does not
stop this manually started server, and the app's Quit button cannot stop it.
**Next time:** open a terminal in the same folder and run `npm start` again.
Repeat `npm run setup` after updating the source or changing configuration,
with Serpo stopped.

Manual setup does not install JobSpy. The keyless boards above work without it;
follow [JobSpy setup](#jobspy-setup-and-search-behavior) if you want its extra
boards. Developer hot reloading is covered under [Development](#development).

## Updates and maintenance

### Updating Serpo

Before updating, close Serpo and make a backup using the instructions below.

- **Installer users:** run the new `Install-Serpo.cmd`. It prepares the replacement
  before changing the installed app, preserves data and `.env.local`, and retains
  the previous full installation in a sibling `.serpo-before-upgrade-...` folder.
- **Manual setup users:** keep `data/` and `.env.local` when updating your source
  files, then run `npm run setup` before `npm start`. Setup verifies the database,
  takes an automatic migration backup when an upgrade is needed, and rebuilds
  the production app when its inputs have changed.

The installer only upgrades copies marked by a previous installer run. It will
not overwrite a source checkout or an older unmarked installation. Keep that
older folder intact, install to a new folder, and use
[backup and restore](#backup-restore-and-removal) to transfer its data.

<details>
<summary>Choosing a different install folder or transferring an older workspace</summary>

Open Command Prompt in the folder containing the new installer and run:

```bat
Install-Serpo.cmd -ProjectRoot "C:\path\to\Serpo-new"
```

From the new installed folder, the backup command accepts
`--root "C:\path\to\Serpo-old"` to snapshot a compatible older workspace. Follow
the terminal preparation and backup instructions below.

</details>

### Backup, restore, and removal

Close the desktop app with **Quit**. If you started it from a terminal, stop it
with **Ctrl+C** instead. Run the following commands from your Serpo folder.

**Windows installer users:** Node may be private to Serpo, so a new terminal
will not necessarily recognize `npm`. Open the installed Serpo folder in File
Explorer, type `cmd` in the address bar, and press Enter. Run this first to make
the installer's Node available in **this Command Prompt only**:

```bat
for /f %v in (.node-version) do set "PATH=%LOCALAPPDATA%\Serpo\node-%v;%PATH%"
```

Manual setup users can use the terminal and Node installation from setup.
Create a backup before updating:

```sh
npm run backup -- --output "../Serpo-backup-before-update"
```

To restore a backup when recovering or transferring a workspace:

```sh
npm run restore -- --input "../Serpo-backup-before-update"
```

Use a **new directory outside the app folder** for each backup. These commands
support the default `data/app.db` workspace only; conflicting custom
`DATABASE_URL` settings are refused rather than guessed. Back up a custom
database and its associated files separately.

The portable backup includes all SQLite records, résumé artifacts, report
archives, and JobSpy cooldown state. It is **not encrypted or sanitized**.
It excludes credentials/configuration, browser profiles, logs, dependencies,
earlier backups, and unrecognized data files. Keep the whole backup directory
private and intact; re-enter integration credentials on a new installation.

Restore checks file hashes, SQLite integrity, and schema compatibility before
replacing data. It supports transfer to another installation directory and
retains the previous `data/` as `data.pre-restore-...`. Existing credentials and
unrecognized local data are preserved. Restore only backups you trust:
checksums detect changes, not who created a backup.

On Windows, run `npm run uninstall` inside an installer-managed copy to remove
unchanged installed application files and its matching desktop shortcut.
Development/unmarked folders are refused. Data, configuration, edited or
unknown files, recovery copies, and shared browser/runtime state are preserved;
uninstall is **not a data wipe**. Review the printed residual paths before
choosing what to delete yourself. See the app's **Privacy** page for Wipe limits.

Setup, the managed app, and maintenance share `.serpo-workspace.lock`. Direct
development servers are not covered by that lock. After a crash, a stale or
ambiguous lock is deliberately refused: stop surviving Serpo processes (restart
Windows if unsure), inspect any reported recovery directories, and only then
remove the stale lock directory. Do not discard recovery copies until the
replacement installation and your data have been checked.

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

- `npm run dev` — developer hot reloading after `npm run setup`; not needed for
  normal use.
- `npm run build:installer` — maintainer-only Windows packaging. Creates
  `dist/Install-Serpo.cmd` from **committed source**, not uncommitted changes.
  People installing Serpo do not need to build this file themselves.
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
