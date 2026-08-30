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
  /** Tier from the search route; "family" listings group under "related titles". */
  relevance?: "exact" | "strong" | "alias" | "family";
}

interface SearchResult {
  source: string;
  label: string;
  listings: Listing[];
  error?: string;
}

interface TitleAlias {
  id: string;
  alias: string;
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
  const [titleAliases, setTitleAliases] = useState<TitleAlias[]>([]);
  // The criteria the visible results came from — alias add/remove re-runs this
  // search even if the form inputs have been edited since.
  const [activeQuery, setActiveQuery] = useState<{ kw: string; loc: string; remote: boolean } | null>(null);
  const [savingAlias, setSavingAlias] = useState<string | null>(null);
  const [pageBySource, setPageBySource] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [tracking, setTracking] = useState<string | null>(null);
  const [generatingResumeFor, setGeneratingResumeFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: kw, location: loc, remoteOnly: remote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Search could not be completed. Please try again.");
        return;
      }
      setResults(data.results ?? []);
      setSuggestedTitles(data.suggestedTitles ?? []);
      setTitleAliases(data.titleAliases ?? []);
      setActiveQuery({ kw, loc, remote });
      setPageBySource({});
      setSearched(true);
      const params = new URLSearchParams({ keywords: kw, location: loc, remoteOnly: String(remote) });
      router.replace(`/sourcing?${params.toString()}`, { scroll: false });
    } catch {
      setError("Search could not be completed. Check your connection and try again.");
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
    setTracking(listing.id);
    setError(null);
    try {
      const res = await fetch("/api/applications", {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "This job could not be added to your applications.");
        return;
      }
      setTracked((prev) => new Set(prev).add(listing.id));
      router.refresh();
    } catch {
      setError("This job could not be added. Check your connection and try again.");
    } finally {
      setTracking(null);
    }
  }

  function setPage(source: string, page: number) {
    setPageBySource((prev) => ({ ...prev, [source]: page }));
  }

  async function addAlias(listing: Listing) {
    if (!activeQuery) return;
    setSavingAlias(listing.id);
    setError(null);
    try {
      const res = await fetch("/api/title-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: activeQuery.kw, alias: listing.role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The alias could not be saved.");
        return;
      }
      await runSearch(activeQuery.kw, activeQuery.loc, activeQuery.remote);
    } catch {
      setError("The alias could not be saved. Check your connection and try again.");
    } finally {
      setSavingAlias(null);
    }
  }

  async function removeAlias(id: string) {
    if (!activeQuery) return;
    setError(null);
    try {
      const res = await fetch(`/api/title-aliases/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The alias could not be removed.");
        return;
      }
      await runSearch(activeQuery.kw, activeQuery.loc, activeQuery.remote);
    } catch {
      setError("The alias could not be removed. Check your connection and try again.");
    }
  }

  async function openResume(listing: Listing) {
    setGeneratingResumeFor(listing.id);
    setError(null);
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "A resume workspace could not be created.");
        return;
      }
      if (data.workspace?.id) {
        router.push(`/resume/${data.workspace.id}`);
      }
    } catch {
      setError("A resume workspace could not be created. Check your connection and try again.");
    } finally {
      setGeneratingResumeFor(null);
    }
  }

  function renderListing(listing: Listing, showAddAlias: boolean) {
    return (
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
            disabled={tracked.has(listing.id) || tracking === listing.id}
            className="btn-primary px-2.5 py-1 text-xs"
          >
            {tracked.has(listing.id) ? "Tracked" : tracking === listing.id ? "Tracking..." : "Track"}
          </button>
          <button
            onClick={() => openResume(listing)}
            disabled={generatingResumeFor === listing.id}
            className="btn-secondary px-2.5 py-1 text-xs"
            title="See a competitive benchmark and an improved version of your own resume for this role"
          >
            {generatingResumeFor === listing.id ? "Generating…" : "Resume"}
          </button>
          {showAddAlias && (
            <button
              onClick={() => addAlias(listing)}
              disabled={savingAlias === listing.id}
              className="btn-secondary px-2.5 py-1 text-xs"
              title="Treat this title as a primary match for this search from now on"
            >
              {savingAlias === listing.id ? "Saving…" : "Add alias"}
            </button>
          )}
        </div>
      </li>
    );
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

      {error && <p role="alert" className="mb-4 text-sm text-danger-dark">{error}</p>}

      <p className="mb-4 text-xs text-foreground-muted">
        Showing exact and same-responsibility title matches (entry/mid-level, US-based or remote). Senior,
        lead, and management titles are excluded. Related titles from the role&#39;s O*NET family are grouped
        separately — add one as an alias to always treat it as a primary match.
      </p>

      {titleAliases.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground-muted">Your aliases for &quot;{activeQuery?.kw}&quot;:</span>
          {titleAliases.map((entry) => (
            <button key={entry.id} onClick={() => removeAlias(entry.id)} className="chip" title="Remove this alias">
              {entry.alias} ✕
            </button>
          ))}
        </div>
      )}

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
            const primary = group.listings.filter((listing) => listing.relevance !== "family");
            const related = group.listings.filter((listing) => listing.relevance === "family");
            const page = pageBySource[group.source] ?? 1;
            const totalPages = Math.max(1, Math.ceil(primary.length / pageSize));
            const pageItems = primary.slice((page - 1) * pageSize, page * pageSize);

            return (
              <div key={group.source} className="cloud-cell p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-primary-dark">
                    {group.label} <span className="font-normal text-foreground-muted">({primary.length})</span>
                  </h2>
                </div>
                {group.error && <p className="mb-2 text-xs text-danger-dark">{group.error}</p>}

                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {pageItems.map((listing) => renderListing(listing, false))}
                  {primary.length === 0 && related.length === 0 && !group.error && (
                    <li className="text-xs text-foreground-muted">No matching titles</li>
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

                {related.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-foreground-muted">
                      {related.length} related title{related.length === 1 ? "" : "s"} from this role&#39;s family
                    </summary>
                    <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                      {related.map((listing) => renderListing(listing, true))}
                    </ul>
                  </details>
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
