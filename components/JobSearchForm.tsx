"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Listing {
  id: string;
  source: string;
  company: string;
  role: string;
  location?: string;
  url: string;
  postedAt?: string;
  description?: string;
}

interface SearchResult {
  source: string;
  label: string;
  listings: Listing[];
  error?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function JobSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [keywords, setKeywords] = useState(searchParams.get("keywords") ?? "");
  const [location, setLocation] = useState(searchParams.get("location") ?? "");
  const [remoteOnly, setRemoteOnly] = useState(searchParams.get("remoteOnly") === "true");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [pageBySource, setPageBySource] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [generatingResumeFor, setGeneratingResumeFor] = useState<string | null>(null);

  // Restores the search that led here when arriving via the Resume tab's
  // Back button (?keywords=...&location=...&remoteOnly=...), instead of
  // landing on a blank form.
  useEffect(() => {
    const initialKeywords = searchParams.get("keywords");
    if (initialKeywords) {
      void runSearch(initialKeywords, searchParams.get("location") ?? "", searchParams.get("remoteOnly") === "true");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(kw: string, loc: string, remote: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: kw, location: loc, remoteOnly: remote }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
      setSuggestedTitles(data.suggestedTitles ?? []);
      setPageBySource({});
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(keywords, location, remoteOnly);
  }

  async function searchTitle(title: string) {
    setKeywords(title);
    await runSearch(title, location, remoteOnly);
  }

  async function track(listing: Listing) {
    await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: listing.company,
        role: listing.role,
        source: listing.source,
        url: listing.url,
        description: listing.description,
        status: "Sourced",
      }),
    });
    setTracked((prev) => new Set(prev).add(listing.id));
    router.refresh();
  }

  function setPage(source: string, page: number) {
    setPageBySource((prev) => ({ ...prev, [source]: page }));
  }

  async function openResume(listing: Listing) {
    setGeneratingResumeFor(listing.id);
    try {
      const originSearchQuery = new URLSearchParams({ keywords, location, remoteOnly: String(remoteOnly) }).toString();
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: listing.company,
          role: listing.role,
          jobDescription: listing.description,
          sourceUrl: listing.url,
          originSearchQuery,
        }),
      });
      const data = await res.json();
      if (data.workspace?.id) {
        router.push(`/resume/${data.workspace.id}`);
      }
    } finally {
      setGeneratingResumeFor(null);
    }
  }

  return (
    <div>
      <form onSubmit={search} className="card-soft mb-6 flex flex-wrap items-center gap-2 p-4">
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Job title (e.g. backend engineer)"
          required
          className="input-soft min-w-[220px] flex-1 px-3 py-2 text-sm"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (optional)"
          className="input-soft w-48 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1 text-sm text-foreground-muted">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="accent-primary" />
          Remote only
        </label>
        <label className="flex items-center gap-1 text-sm text-foreground-muted">
          Show
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="input-soft px-2 py-1 text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          per page
        </label>
        <button type="submit" disabled={loading} className="btn-primary px-4 py-2 text-sm">
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <p className="mb-4 text-xs text-foreground-muted">
        Showing exact title matches only (entry/mid-level, US-based or remote). Titles containing
        &quot;senior&quot; are excluded.
      </p>

      {suggestedTitles.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground-muted">Suggested titles to try:</span>
          {suggestedTitles.map((title) => (
            <button key={title} onClick={() => searchTitle(title)} disabled={loading} className="chip">
              {title}
            </button>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {results.map((group) => {
            const page = pageBySource[group.source] ?? 1;
            const totalPages = Math.max(1, Math.ceil(group.listings.length / pageSize));
            const pageItems = group.listings.slice((page - 1) * pageSize, page * pageSize);

            return (
              <div key={group.source} className="cloud-cell p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-primary-dark">
                    {group.label} <span className="font-normal text-foreground-muted">({group.listings.length})</span>
                  </h2>
                </div>
                {group.error && <p className="mb-2 text-xs text-danger-dark">{group.error}</p>}

                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {pageItems.map((listing) => (
                    <li key={listing.id} className="rounded-2xl border border-border-soft bg-surface p-3 text-sm">
                      <div className="font-semibold text-foreground">{listing.role}</div>
                      <div className="mb-2 text-foreground-muted">
                        {listing.company}
                        {listing.location ? ` · ${listing.location}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={listing.url} target="_blank" rel="noopener noreferrer" className="btn-secondary px-2.5 py-1 text-xs">
                          Open
                        </a>
                        <button
                          onClick={() => track(listing)}
                          disabled={tracked.has(listing.id)}
                          className="btn-primary px-2.5 py-1 text-xs"
                        >
                          {tracked.has(listing.id) ? "Tracked" : "Track"}
                        </button>
                        <button
                          onClick={() => openResume(listing)}
                          disabled={generatingResumeFor === listing.id}
                          className="btn-secondary px-2.5 py-1 text-xs"
                          title="See a competitive benchmark and an improved version of your own resume for this role"
                        >
                          {generatingResumeFor === listing.id ? "Generating…" : "Resume"}
                        </button>
                      </div>
                    </li>
                  ))}
                  {group.listings.length === 0 && !group.error && (
                    <li className="text-xs text-foreground-muted">No exact-title matches</li>
                  )}
                </ul>

                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-xs text-foreground-muted">
                    <button
                      onClick={() => setPage(group.source, page - 1)}
                      disabled={page <= 1}
                      className="btn-secondary px-2.5 py-1 text-xs"
                    >
                      Prev
                    </button>
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(group.source, page + 1)}
                      disabled={page >= totalPages}
                      className="btn-secondary px-2.5 py-1 text-xs"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {searched && results.length === 0 && (
        <p className="text-sm text-foreground-muted">
          No sources are configured yet — add API keys in .env.local to start searching.
        </p>
      )}
    </div>
  );
}
