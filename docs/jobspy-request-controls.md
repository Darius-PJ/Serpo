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

Defaults in `.env.example` (restart Serpo after changing environment settings):

| Setting | Default | Purpose |
| --- | --- | --- |
| `JOBSPY_RESULTS_WANTED` | 10 | Results requested per board; maximum 25. Not a count of HTTP requests. |
| `JOBSPY_REQUEST_DELAY_SECONDS` | 3 | Minimum gap between HTTP sends inside a scrape; minimum 1 second. |
| `JOBSPY_MIN_INTERVAL_SECONDS` | 60 | Minimum pause between fresh scrapes of a non-Google board, across keywords. |
| `JOBSPY_GOOGLE_INTERVAL_SECONDS` | 900 | Minimum pause between fresh Google scrapes, across keywords. |
| `JOBSPY_FAILURE_COOLDOWN_SECONDS` | 1800 | Pause after a failed scrape; longer `Retry-After` values take precedence. |
| `JOBSPY_TIMEOUT_MS` | 90000 | Overall per-board deadline, including time waiting in the shared queue. A queued board that misses its deadline does not send requests. |
| `JOB_CACHE_TTL_MINUTES` | 15 | Existing cache freshness setting. Cache hits send no requests. |

Cooldown timestamps are saved beside the configured database in
`<database>.jobspy-state.json`; restart does not clear them. A corrupt/unreadable
state file fails closed rather than silently resetting limits. These controls
coordinate one Serpo server, not multiple independent app processes or other
users on the same network.

Successful cached results up to 24 hours old may be shown during a failure, with
their fetch time explicitly displayed. Partial results are shown with a warning
and do not replace the last successful cache. Technical details are collapsible.
Existing combined `jobspy` cache entries are not reused as per-board results.
Listing IDs retain the existing `jobspy:<board>:<job-id>` shape.

Google's [unusual traffic guidance](https://support.google.com/websearch/answer/86640)
does not publish a numeric safe request threshold. It describes automated searches
and shared-network/VPN traffic as possible triggers. These are Serpo's conservative
defaults, not Google-approved limits or a guarantee against blocking. A Google
`/sorry/` response triggers a pause, not an attempt to solve or bypass the challenge.

Validation uses simulated responses and local tests; no job-board traffic is needed.
