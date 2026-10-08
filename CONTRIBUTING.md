# Contributing to Serpo

Serpo is a local-first, password-free, single-user application. Keep the server
bound to loopback, AI assistance disabled by default, and submissions and
message sending under the user's control. Read [the architecture](docs/ARCHITECTURE.md)
before changing these boundaries.

## Development

Use Node.js 24 LTS (at least 24.18.0, below 25; `.node-version` pins the tested
baseline). From the repository root, with Serpo closed:

```sh
npm run setup
npm run dev
```

Setup creates local configuration and data and prepares a production build;
`dev` is the contributor hot-reloading server. Work with invented data and
leave external API keys unset. Never commit `.env.local`, databases, backups,
résumés, logs, or browser profiles. Do not modify someone else's workspace to
reproduce a bug.

Before submitting, run `npm run verify` with `DATABASE_URL=file:./data/app.db`
in your environment. This runs lint, type checking, deployment validation,
a production build, and the unit, script, and end-to-end suites. Install test
browsers once with `npx playwright install`. On Windows, run from the actual
cased repository path (for example `Documents`, not `documents`).

Use the existing test conventions. Add regression coverage for meaningful
behavior or data-loss risks; don't assert source text or incidental wording.
Database migrations are hand-written SQL, not `prisma migrate dev`. Keep
upgrades recoverable and explain compatibility or data-flow changes.

## Issues and pull requests

Open a focused issue before a large change. Include the version or commit,
Windows/OS version, Node version, steps, expected result, and actual result.
Use invented examples and redact logs and screenshots. For security issues,
follow [SECURITY.md](SECURITY.md) instead of posting publicly.

Keep pull requests scoped and explain user-visible behavior and verification.
Include screenshots for UI changes and update affected user guidance.
Contribute only code and assets you have the right to license under the
project's [AGPLv3-only license](LICENSE); retain third-party license notices.
There is no guaranteed review or response time.
