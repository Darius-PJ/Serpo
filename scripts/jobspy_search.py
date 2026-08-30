"""
Helper invoked by lib/jobAdapters/adapters/jobspy/index.ts. Requires
`pip install python-jobspy`; set JOBSPY_PYTHON when that package lives in a
dedicated interpreter or venv (see .env.example). Prints a JSON array of
results to stdout for the Node adapter to parse.

Always invoked when the jobspy adapter runs — there is no separate opt-in
flag. JobSpy scrapes sites (LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google)
whose Terms of Service restrict automated access; running this tool at all is
the call the person running it has already made (see the adapter's tosNotes).

Importable without python-jobspy installed: the scrape import lives inside
main() so tests can exercise the pure helpers below on any Python.
"""

import argparse
import json
import sys

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
    try:
        from jobspy import scrape_jobs
    except ImportError:
        print(
            "python-jobspy is not installed. Run: pip install python-jobspy",
            file=sys.stderr,
        )
        sys.exit(1)

    parser = argparse.ArgumentParser()
    parser.add_argument("--keywords", required=True)
    parser.add_argument("--location", default=None)
    parser.add_argument("--remote-only", action="store_true")
    args = parser.parse_args()

    jobs = scrape_jobs(
        # "google" is Google for Jobs, which itself aggregates postings from
        # thousands of other sites/company career pages — the single highest-
        # leverage addition to search breadth available through this scraper.
        # It reads only google_search_term; the structured params below drive
        # the other four sites.
        site_name=["indeed", "linkedin", "zip_recruiter", "glassdoor", "google"],
        search_term=args.keywords,
        google_search_term=build_google_search_term(args.keywords, args.location, args.remote_only),
        location=args.location,
        is_remote=args.remote_only,
        results_wanted=25,
    )

    records = jobs.to_dict(orient="records")
    # default=str stringifies the leftovers sanitize_records passes through
    # (datetime.date in date_posted, numpy scalars).
    print(json.dumps(sanitize_records(records), default=str))


if __name__ == "__main__":
    main()
