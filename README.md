<p align="center">
  <img src="public/RokuroSerpo.avif" alt="RokuroSerpo" width="720">
</p>

# Job Tracker

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
  optional OSINT-based discovery per application.
- **Sourcing** — federated job search across Adzuna, USAJobs, Jooble, the
  keyless boards above, and optionally JobSpy, with dedup and relevance tiers.
- **Résumé workspace** — keep a template, tailor per application, export DOCX.

## Getting started

```bash
npm install
npx prisma generate
cp .env.example .env.local   # then fill in any optional keys
npx prisma migrate deploy    # creates data/app.db
npm run dev
```

Open http://127.0.0.1:3000/dashboard.

On Windows, `scripts/launchJobTracker.ps1` does all of the above server-side
work for you: it finds a free port, upgrades the database if needed (with an
automatic backup), starts the server, and opens the dashboard — suitable as a
desktop shortcut target.

## Development

Built with Next.js (App Router), Prisma + better-sqlite3, Tailwind CSS,
Vitest, and Playwright.

- `npm run verify` — the full release gate: lint, typecheck, deployment-config
  check, production build, unit tests, e2e tests. CI runs the same steps.
- `npm run test:unit` / `npm run test:e2e` — the test suites individually.
- `npm run db:upgrade-and-verify` — applies pending hand-written SQL
  migrations to the live database, fail-closed: each migration is replayed
  against an in-memory copy and schema-fingerprinted before it touches
  `data/app.db`, and a timestamped backup is taken first.

Migrations are hand-written SQL under `prisma/migrations/` (no
`prisma migrate dev`); the schema in `prisma/schema.prisma` is the source of
truth for the generated client.
