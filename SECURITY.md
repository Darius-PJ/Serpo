# Security

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Darius-PJ/Serpo/security/advisories/new).
Do not report exploitable security details in a public issue or pull request.

Include the affected version or commit, operating system, reproduction steps,
expected impact, and a minimal example using invented data. Never attach API
keys, `.env.local`, your database, backups, browser profile, résumé, or unredacted
logs. If you exposed a credential, revoke it with its provider; deleting a post
or file does not revoke it.

Reports are reviewed on a best-effort basis. There is no guaranteed response
time, bounty, or independent security certification. Serpo is pre-release;
security fixes target the current code on `main`. Older revisions are not
promised ongoing security maintenance.

## Supported security boundary

Serpo is a password-free, single-user application bound to `127.0.0.1`.
Do not expose its port to a network, public host, tunnel, or reverse proxy.
Local binding is not authentication or encryption: another process or person
using your operating-system account can access workspace data and credentials.
Protect the account, device, backups, and any synced folders accordingly.

Optional integrations contact external providers. See **Privacy** in the app
for the data sent, triggers, and deletion limitations. Generated content and
job-board results are untrusted input, not verified advice or instructions.

For ordinary bugs or installation help, use the
[public issue tracker](https://github.com/Darius-PJ/Serpo/issues), with personal
data and secrets removed.
