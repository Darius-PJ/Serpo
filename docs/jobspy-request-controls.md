# JobSpy boards and request controls

Indeed, LinkedIn, ZipRecruiter, Glassdoor, and Google Jobs have separate result
sections, errors, cache keys, and cooldowns. The sourcing form lets you select
which boards to query; that selection is preserved in the search URL, including
returning from resume generation. Other search consumers use all five by default.

Serpo runs one JobSpy subprocess at a time across searches in its local server.
Identical in-flight board queries share a result. Each subprocess selects one
board, spaces HTTP requests, disables JobSpy's urllib3 retry loop, and stops
issuing requests after an HTTP failure. Logged errors are captured too: an empty
DataFrame after a failed location lookup is not reported as zero matches.

The helper requires `python-jobspy==1.1.82`. Provision with
`scripts/setupJobSpy.ps1`; custom interpreters must install the same version.
Before scraping, Serpo validates the version and private request-hook signatures.
An incompatible installation exits with setup instructions before making requests.

On Windows, run from the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setupJobSpy.ps1
```

This provisions a private Python 3.12 environment at `.venv-jobspy` and only
short-circuits when compatibility validation passes. `npm run setup` handles the
Node application/database, not this Python environment. For a custom Python
3.10–3.12 environment, install the pinned package there and set `JOBSPY_PYTHON`
in `.env.local` to its interpreter path.

Defaults in `.env.example` (restart Serpo after changing environment settings):

| Setting | Default | Purpose |
| --- | --- | --- |
| `JOBSPY_RESULTS_WANTED` | 10 | Results requested per board; maximum 25. Not a count of HTTP requests. |
| `JOBSPY_REQUEST_DELAY_SECONDS` | 3 | Minimum gap between HTTP sends inside a scrape; minimum 1 second. |
| `JOBSPY_MIN_INTERVAL_SECONDS` | 60 | Minimum pause between fresh scrapes of a non-Google board, across keywords. |
| `JOBSPY_GOOGLE_INTERVAL_SECONDS` | 900 | Minimum pause between fresh Google scrapes, across keywords. |
| `JOBSPY_FAILURE_COOLDOWN_SECONDS` | 1800 | Pause after a board-reported failure; longer `Retry-After` values take precedence. Local timeout, abort, setup, and malformed-output errors do not trigger this cooldown. |
| `JOBSPY_TIMEOUT_MS` | 90000 | Per-board execution budget, starting when dequeued. Waiting behind another board does not consume it. |
| `JOB_CACHE_TTL_MINUTES` | 15 | Existing cache freshness setting. Cache hits send no requests. |

Cooldown timestamps are saved beside the configured database in
`<database>.jobspy-state.json`; restart does not clear them. A corrupt/unreadable
state file fails closed rather than silently resetting limits. These controls
coordinate one Serpo server, not multiple independent app processes or other
users on the same network.

Normal per-board request spacing still applies after local errors. A timed-out
subprocess must close before the next queued board starts. Existing persisted
cooldowns are not cleared by these changes.
The orchestrator's separate per-source circuit breaker is unchanged: repeated
local errors can still open that short-lived breaker. Excluding queue wait from
each board's timeout also means the total search can exceed `JOBSPY_TIMEOUT_MS`;
the response waits for all selected adapters rather than streaming each result.

Successful cached results up to 24 hours old may be shown during a failure, with
their fetch time explicitly displayed. Partial results are shown with a warning
and do not replace the last successful cache. Technical details are collapsible.
Existing combined `jobspy` cache entries are not reused as per-board results.
Listing IDs retain the existing `jobspy:<board>:<job-id>` shape.

## Troubleshooting

- **Incompatible setup:** use the repair command printed in the error with the
  interpreter it names, or rerun the Windows setup script for the managed venv.
  Installing an arbitrary newer JobSpy version is not a supported repair.
- **Local timeout or invalid helper output:** inspect the source's error details.
  These errors retain normal request spacing, not a new 30-minute board cooldown.
- **Board paused:** respect the displayed retry time. A board-reported failure,
  normal spacing, or a previously persisted cooldown can still pause that board
  after updating Serpo; restarting does not erase its reservation.
- **Cached results shown:** the displayed fetch time identifies older results,
  not a successful live scrape. Partial results do not refresh the successful cache.

Google's [unusual traffic guidance](https://support.google.com/websearch/answer/86640)
does not publish a numeric safe request threshold. It describes automated searches
and shared-network/VPN traffic as possible triggers. These are Serpo's conservative
defaults, not Google-approved limits or a guarantee against blocking. A Google
`/sorry/` response triggers a pause, not an attempt to solve or bypass the challenge.

Validation uses simulated responses and local tests; no job-board traffic is needed.
