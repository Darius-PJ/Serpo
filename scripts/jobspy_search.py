"""
Helper invoked by lib/jobAdapters/adapters/jobspy/index.ts. Requires
`pip install python-jobspy==1.1.82`; set JOBSPY_PYTHON when that package lives in a
dedicated interpreter or venv (see .env.example). Scrapes one selected board
and prints a JSON envelope containing items, status, and diagnostic details.

Importable without python-jobspy installed: package imports happen only during
setup so tests can exercise the pure helpers below on any Python.
"""

import argparse
import inspect
import json
import sys
import logging
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from importlib import metadata

SITES = ["indeed", "linkedin", "zip_recruiter", "glassdoor", "google"]
JOBSPY_VERSION = "1.1.82"


def classify_failure(message):
    text = message.lower()
    if "429" in text or "/sorry/" in text or "captcha" in text:
        return "rate-limited"
    if re.search(r"\b403\b", text) or "forbidden" in text:
        return "blocked"
    if re.search(r"\b400\b", text) or "location not parsed" in text:
        return "invalid-request"
    return "error"


def retry_after_seconds(value):
    try:
        return max(0, float(value))
    except (TypeError, ValueError):
        try:
            return max(0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return 0


class RequestGuard:
    """Pace individual HTTP requests; stop this scrape after an upstream failure.

    JobSpy catches some request exceptions and returns empty/partial data. Keep
    the failure separately so those responses cannot masquerade as no matches.
    """
    def __init__(self, delay_seconds):
        self.delay = delay_seconds
        self.last_request = None
        self.failure = None
        self.retry_after = 0

    def call(self, request, *args, **kwargs):
        if self.failure:
            raise RuntimeError(self.failure)
        if self.last_request is not None:
            time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        response = request(*args, **kwargs)
        status = response.status_code
        url = str(getattr(response, "url", ""))
        if status >= 400 or "/sorry/" in url:
            self.retry_after = retry_after_seconds(response.headers.get("Retry-After"))
            self.failure = f"HTTP {status}" + (" Google /sorry/ automated traffic challenge" if "/sorry/" in url else "")
            raise RuntimeError(self.failure)
        return response


def validate_jobspy():
    installed = metadata.version("python-jobspy")
    if installed != JOBSPY_VERSION:
        raise RuntimeError(f"Expected python-jobspy=={JOBSPY_VERSION}, found {installed}")

    from jobspy import scrape_jobs
    from jobspy.util import RequestsRotating, TLSRotating

    if not callable(scrape_jobs):
        raise RuntimeError("jobspy.scrape_jobs is not callable")
    # These private hooks are verified against 1.1.82. Ignore annotations (the
    # inherited requests.Session.send is annotated), but reject shape changes.
    for owner, name, expected in (
        (RequestsRotating, "setup_session", "(self, has_retry, delay)"),
        (RequestsRotating, "send", "(self, request, **kwargs)"),
        (TLSRotating, "execute_request", "(self, *args, **kwargs)"),
    ):
        target = getattr(owner, name, None)
        label = f"{owner.__name__}.{name}"
        if not callable(target):
            raise RuntimeError(f"{label} is missing or not callable")
        try:
            signature = inspect.signature(target)
        except (TypeError, ValueError) as error:
            raise RuntimeError(f"Cannot inspect {label}") from error
        signature = signature.replace(
            parameters=[p.replace(annotation=inspect.Parameter.empty) for p in signature.parameters.values()],
            return_annotation=inspect.Signature.empty,
        )
        if str(signature) != expected:
            raise RuntimeError(f"Incompatible {label}{signature}; expected {expected}")
    return scrape_jobs, RequestsRotating, TLSRotating


def install_request_guard(guard):
    # Runtime wrappers only; do not modify the installed JobSpy package. Disable
    # its hidden urllib3 retry loop so one 429 doesn't produce three more calls.
    # Validate every hook before mutating any of them or starting a scrape.
    scrape_jobs, RequestsRotating, TLSRotating = validate_jobspy()
    from requests.adapters import HTTPAdapter
    original_setup = RequestsRotating.setup_session
    original_send = RequestsRotating.send
    original_execute = TLSRotating.execute_request

    def setup(session, has_retry, delay):
        original_setup(session, False, delay)
        session.mount("http://", HTTPAdapter(max_retries=0))
        session.mount("https://", HTTPAdapter(max_retries=0))

    def send(session, request, **kwargs):
        # Intercept each send, including redirects, rather than only Session.get.
        return guard.call(original_send, session, request, **kwargs)

    def execute(session, *args, **kwargs):
        return guard.call(original_execute, session, *args, **kwargs)

    RequestsRotating.setup_session = setup
    RequestsRotating.send = send
    TLSRotating.execute_request = execute
    return scrape_jobs


class ErrorCapture(logging.Handler):
    def __init__(self):
        super().__init__(logging.ERROR)
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def scrape_board(scrape_jobs, site, keywords, location, remote_only, results_wanted, guard):
    capture = ErrorCapture()
    loggers = [logging.getLogger(name) for name in logging.Logger.manager.loggerDict if name.startswith("JobSpy")]
    for logger in loggers:
        logger.addHandler(capture)
    records = []
    exception = None
    try:
        jobs = scrape_jobs(
            site_name=[site], search_term=keywords,
            google_search_term=build_google_search_term(keywords, location, remote_only),
            location=location, is_remote=remote_only, country_indeed="usa",
            results_wanted=results_wanted, linkedin_fetch_description=False, verbose=0,
        )
        records = sanitize_records(jobs.to_dict(orient="records"))
    except Exception as error:
        exception = str(error)
    finally:
        for logger in loggers:
            logger.removeHandler(capture)
    details = "\n".join(filter(None, [guard.failure, exception, *capture.messages]))
    return {
        "site": site, "items": records,
        "status": classify_failure(details) if details else "ok",
        "details": details[:4000], "retryAfterSeconds": guard.retry_after,
    }

# The only fields the Node adapter reads (JobSpyRawResult in
# lib/jobAdapters/adapters/jobspy/index.ts). Projecting to these keeps the
# stdout payload small and every value JSON-safe.
ADAPTER_FIELDS = ["site", "id", "company", "title", "location", "job_url", "date_posted", "description"]


def _null_if_na(value):
    # pandas leaves NaN (floats) and NaT (dates) in to_dict() records, and
    # json.dumps serializes them as bare NaN — invalid JSON the Node side
    # rejects. Both are the only values unequal to themselves, which spares
    # this module a pandas import.
    try:
        if value != value:
            return None
    except Exception:
        pass
    return value


def sanitize_records(records):
    """Project scraped records to the adapter's fields, with JSON-safe values."""
    return [{field: _null_if_na(record.get(field)) for field in ADAPTER_FIELDS} for record in records]


def build_google_search_term(keywords, location, remote_only):
    """Google for Jobs ignores the structured params and honors only
    google_search_term, so compose a natural query from the same criteria."""
    term = f"{keywords} jobs"
    if location:
        term += f" near {location}"
    if remote_only:
        term += " remote"
    return term


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True, choices=SITES)
    parser.add_argument("--results-wanted", type=int, default=10)
    parser.add_argument("--request-delay", type=float, default=3)
    parser.add_argument("--keywords", required=True)
    parser.add_argument("--location", default=None)
    parser.add_argument("--remote-only", action="store_true")
    args = parser.parse_args()

    guard = RequestGuard(max(1, args.request_delay))
    try:
        scrape_jobs = install_request_guard(guard)
    except Exception as error:
        print(
            f"JobSpy setup is incompatible: {error}. "
            f'Run: "{sys.executable}" -m pip install --force-reinstall python-jobspy=={JOBSPY_VERSION}',
            file=sys.stderr,
        )
        sys.exit(1)
    result = scrape_board(scrape_jobs, args.site, args.keywords, args.location,
                          args.remote_only, max(1, min(25, args.results_wanted)), guard)
    print(json.dumps(result, default=str, allow_nan=False))


if __name__ == "__main__":
    main()
