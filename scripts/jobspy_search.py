"""
Helper invoked by lib/jobSources/jobSpy.ts. Requires `pip install python-jobspy`.
Prints a JSON array of results to stdout so the Node connector can parse them.

Only runs when JOBSPY_ENABLED=true is set — JobSpy scrapes sites (LinkedIn,
Indeed, Glassdoor, ZipRecruiter) whose Terms of Service restrict automated
access. That's a call for the person running this tool to make, not a default.
"""

import argparse
import json
import sys

try:
    from jobspy import scrape_jobs
except ImportError:
    print(
        "python-jobspy is not installed. Run: pip install python-jobspy",
        file=sys.stderr,
    )
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keywords", required=True)
    parser.add_argument("--location", default=None)
    parser.add_argument("--remote-only", action="store_true")
    args = parser.parse_args()

    jobs = scrape_jobs(
        site_name=["indeed", "linkedin", "zip_recruiter", "glassdoor"],
        search_term=args.keywords,
        location=args.location,
        is_remote=args.remote_only,
        results_wanted=25,
    )

    records = jobs.to_dict(orient="records")
    print(json.dumps(records, default=str))


if __name__ == "__main__":
    main()
