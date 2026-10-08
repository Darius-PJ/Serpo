"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { JOBSPY_BOARDS, selectedJobSpySites, type JobSpySite } from "@/lib/jobSpyBoards";
import { CADENCES, JOBSPY_CADENCES, isCadence, type Cadence } from "@/lib/automation/cadence";

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
  /** As the source states it; the search route guarantees contract/temporary in a contract search. */
  employmentType?: "full-time" | "part-time" | "contract" | "temporary";
}

interface SearchResult {
  errorDetails?: string;
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
  const [contractOnly, setContractOnly] = useState(searchParams.get("employmentType") === "contract");
  const [jobSpySites, setJobSpySites] = useState(() => selectedJobSpySites(searchParams.has("jobSpySites") ? searchParams.get("jobSpySites")!.split(",") : undefined));
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [titleAliases, setTitleAliases] = useState<TitleAlias[]>([]);
  // The criteria the visible results came from — alias add/remove re-runs this
  // search even if the form inputs have been edited since, and "Save this
  // search" saves exactly these, JobSpy boards included.
  const [activeQuery, setActiveQuery] = useState<{ kw: string; loc: string; remote: boolean; contract: boolean; sites: JobSpySite[] } | null>(null);
  const [savingAlias, setSavingAlias] = useState<string | null>(null);
  const [pageBySource, setPageBySource] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [tracking, setTracking] = useState<string | null>(null);
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [eliminating, setEliminating] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [generatingResumeFor, setGeneratingResumeFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCadence, setSaveCadence] = useState<Cadence>("daily");
  const [savingSearch, setSavingSearch] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Restores the search that led here when arriving via the Resume tab's
  // Back button (?keywords=...&location=...&remoteOnly=...&employmentType=...),
  // instead of landing on a blank form.
  useEffect(() => {
    const initialKeywords = searchParams.get("keywords");
    if (initialKeywords) {
      void runSearch(initialKeywords, searchParams.get("location") ?? "", searchParams.get("remoteOnly") === "true", searchParams.get("employmentType") === "contract");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(kw: string, loc: string, remote: boolean, contract: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: kw, location: loc, remoteOnly: remote, employmentType: contract ? "contract" : "any", jobSpySites }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Search could not be completed. Please try again.");
        return;
      }
      setResults(data.results ?? []);
      setSuggestedTitles(data.suggestedTitles ?? []);
      setTitleAliases(data.titleAliases ?? []);
      setActiveQuery({ kw, loc, remote, contract, sites: jobSpySites });
      // A new result set closes a save form opened for the previous one.
      setSaveOpen(false);
      setSaveStatus(null);
      setPageBySource({});
      setSearched(true);
      const params = new URLSearchParams({ keywords: kw, location: loc, remoteOnly: String(remote), employmentType: contract ? "contract" : "any" });
      params.set("jobSpySites", jobSpySites.join(","));
      router.replace(`/sourcing?${params.toString()}`, { scroll: false });
    } catch {
      setError("Search could not be completed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(keywords, location, remoteOnly, contractOnly);
  }

  async function searchTitle(title: string) {
    setKeywords(title);
    await runSearch(title, location, remoteOnly, contractOnly);
  }

  function openSaveForm() {
    setSaveName("");
    setSaveCadence("daily");
    setSaveStatus(null);
    setSaveOpen(true);
  }

  async function saveSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!activeQuery) return;
    setSavingSearch(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName,
          keywords: activeQuery.kw,
          location: activeQuery.loc,
          remoteOnly: activeQuery.remote,
          employmentType: activeQuery.contract ? "contract" : "any",
          jobSpySites: activeQuery.sites,
          cadence: saveCadence,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "This search could not be saved.");
        return;
      }
      setSaveOpen(false);
      setSaveStatus("Saved. Find it under Saved searches on Sourcing.");
      router.refresh();
    } catch {
      setError("This search could not be saved. Check your connection and try again.");
    } finally {
      setSavingSearch(false);
    }
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

  async function eliminate(listing: Listing) {
    setEliminating(listing.id);
    setError(null);
    setEliminated((prev) => new Set(prev).add(listing.id));
    try {
      const res = await fetch("/api/jobs/eliminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: listing.url,
          company: listing.company,
          role: listing.role,
          source: listing.source,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "This job could not be eliminated.");
        setEliminated((prev) => {
          const next = new Set(prev);
          next.delete(listing.id);
          return next;
        });
      }
    } catch {
      setError("This job could not be eliminated. Check your connection and try again.");
      setEliminated((prev) => {
        const next = new Set(prev);
        next.delete(listing.id);
        return next;
      });
    } finally {
      setEliminating(null);
    }
  }

  async function restoreEliminated(listing: Listing) {
    if (restoring === listing.id) return;
    setRestoring(listing.id);
    setError(null);
    try {
      const res = await fetch("/api/jobs/eliminate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: listing.url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "This job could not be restored.");
        return;
      }
      setEliminated((prev) => {
        const next = new Set(prev);
        next.delete(listing.id);
        return next;
      });
    } catch {
      setError("This job could not be restored. Check your connection and try again.");
    } finally {
      setRestoring(null);
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
      await runSearch(activeQuery.kw, activeQuery.loc, activeQuery.remote, activeQuery.contract);
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
      await runSearch(activeQuery.kw, activeQuery.loc, activeQuery.remote, activeQuery.contract);
    } catch {
      setError("The alias could not be removed. Check your connection and try again.");
    }
  }

  async function openResume(listing: Listing) {
    setGeneratingResumeFor(listing.id);
    setError(null);
    try {
      const originSearchQuery = new URLSearchParams({ keywords, location, remoteOnly: String(remoteOnly), employmentType: contractOnly ? "contract" : "any", jobSpySites: jobSpySites.join(",") }).toString();
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
    if (eliminated.has(listing.id)) {
      return (
        <li key={listing.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-soft bg-surface p-3 text-base">
          <span className="text-foreground-muted line-through">{listing.role}</span>
          <span className="text-foreground-muted">· {listing.company}</span>
          <span className="text-foreground-muted">— eliminated</span>
          <button onClick={() => restoreEliminated(listing)} disabled={restoring === listing.id} className="btn-secondary px-3 text-sm">
            {restoring === listing.id ? "Restoring…" : "Undo"}
          </button>
        </li>
      );
    }
    return (
      <li key={listing.id} className="rounded-2xl border border-border-soft bg-surface p-3 text-base">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
          {listing.role}
          {(listing.employmentType === "contract" || listing.employmentType === "temporary") && (
            <span className="rounded-full border border-border-soft px-2 py-0.5 text-sm font-semibold text-foreground">
              {listing.employmentType === "contract" ? "Contract" : "Temporary"}
            </span>
          )}
        </div>
        <div className="mb-2 text-foreground-muted">
          {listing.company}
          {listing.location ? ` · ${listing.location}` : ""}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 text-sm">
            Open
          </a>
          <button
            onClick={() => track(listing)}
            disabled={tracked.has(listing.id) || tracking === listing.id}
            className="btn-primary px-3 text-sm"
          >
            {tracked.has(listing.id) ? "Tracked" : tracking === listing.id ? "Tracking..." : "Track"}
          </button>
          <button
            onClick={() => openResume(listing)}
            disabled={generatingResumeFor === listing.id}
            className="btn-secondary px-3 text-sm"
            title="See a competitive benchmark and an improved version of your own resume for this role"
          >
            {generatingResumeFor === listing.id ? "Generating…" : "Resume"}
          </button>
          {showAddAlias && (
            <button
              onClick={() => addAlias(listing)}
              disabled={savingAlias === listing.id}
              className="btn-secondary px-3 text-sm"
              title="Treat this title as a primary match for this search from now on"
            >
              {savingAlias === listing.id ? "Saving…" : "Add alias"}
            </button>
          )}
          <button
            onClick={() => eliminate(listing)}
            disabled={eliminating === listing.id}
            className="btn-secondary px-3 text-sm"
            title="Hide this job from future searches"
          >
            {eliminating === listing.id ? "Eliminating…" : "Eliminate"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <div>
      <form onSubmit={search} className="surface-inset mb-6 flex flex-wrap items-center gap-2 p-4">
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Job title (e.g. backend engineer)"
          required
          className="input-soft min-w-[min(220px,100%)] flex-1 px-3 py-2 text-base"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (optional)"
          className="input-soft w-48 px-3 py-2 text-base"
        />
        <label className="flex items-center gap-1 text-base text-foreground-muted">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="accent-primary" />
          Remote only
        </label>
        <label className="flex items-center gap-1 text-base text-foreground-muted" title="Only contract, contract-to-hire, and temporary jobs">
          <input type="checkbox" checked={contractOnly} onChange={(e) => setContractOnly(e.target.checked)} className="accent-primary" />
          Contract &amp; temp only
        </label>
        <label className="flex items-center gap-1 text-base text-foreground-muted">
          Show
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="input-soft px-2 py-1 text-base"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          per page
        </label>
        <button type="submit" disabled={loading} className="btn-primary px-4 py-2 text-base">
          {loading ? "Searching…" : "Search"}
        </button>
        <fieldset disabled={loading} className="w-full border-t border-foreground-muted/20 pt-3">
          <legend className="text-sm font-medium text-foreground-muted">Search with JobSpy</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {JOBSPY_BOARDS.map(({ site, label }) => (
              <label key={site} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={jobSpySites.includes(site)} className="accent-primary"
                  onChange={(event) => setJobSpySites((current) => event.target.checked ? [...current, site] : current.filter((value) => value !== site))} />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-foreground-muted">Uncheck boards you do not need to reduce requests. Searches reuse cached results; new requests are paced and blocked boards pause automatically.</p>
        </fieldset>
      </form>

      {error && <p role="alert" className="mb-4 text-base text-danger-dark">{error}</p>}

      {activeQuery && (
        <div className="mb-4">
          {saveOpen ? (
            <form onSubmit={saveSearch} aria-label="Save this search" className="card-soft flex flex-wrap items-end gap-2 p-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground-muted">
                Name
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={activeQuery.kw}
                  maxLength={100}
                  className="input-soft w-64 max-w-full px-3 py-2 text-base"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground-muted">
                How often
                <select
                  value={saveCadence}
                  onChange={(e) => {
                    if (isCadence(e.target.value)) setSaveCadence(e.target.value);
                  }}
                  className="input-soft px-2 py-2 text-base"
                >
                  {CADENCES.map(({ value, label }) => (
                    <option key={value} value={value} disabled={activeQuery.sites.length > 0 && !JOBSPY_CADENCES.includes(value)}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={savingSearch} className="btn-primary px-4 py-2 text-base">
                {savingSearch ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setSaveOpen(false)} disabled={savingSearch} className="btn-secondary px-4 py-2 text-base">
                Cancel
              </button>
              {activeQuery.sites.length > 0 && (
                <p className="w-full text-sm text-foreground-muted">Searches that include JobSpy boards run at most once a day.</p>
              )}
            </form>
          ) : (
            <button type="button" onClick={openSaveForm} className="btn-secondary px-3 text-sm">
              Save this search
            </button>
          )}
          {saveStatus && <p role="status" className="mt-2 text-sm text-foreground-muted">{saveStatus}</p>}
        </div>
      )}

      <p className="mb-4 text-sm text-foreground-muted">
        Showing exact and same-responsibility title matches (entry/mid-level, US-based or remote). Senior,
        lead, and management titles are excluded. Related titles from the role&#39;s O*NET family are grouped
        separately — add one as an alias to always treat it as a primary match.
        {activeQuery?.contract && " Contract searches keep only jobs the board lists as contract or temporary, or whose title says so."}
      </p>

      {titleAliases.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground-muted">Your aliases for &quot;{activeQuery?.kw}&quot;:</span>
          {titleAliases.map((entry) => (
            <button key={entry.id} onClick={() => removeAlias(entry.id)} className="chip" title="Remove this alias">
              {entry.alias} ✕
            </button>
          ))}
        </div>
      )}

      {suggestedTitles.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground-muted">Suggested titles to try:</span>
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
                  <h2 className="text-base font-bold text-heading">
                    {group.label} <span className="font-normal text-foreground-muted">({primary.length})</span>
                  </h2>
                </div>
                {group.error && <p className="mb-2 text-sm text-danger-dark">{group.error}</p>}
                {group.errorDetails && <details className="mb-2 text-sm text-foreground-muted"><summary className="cursor-pointer">Error details</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{group.errorDetails}</pre></details>}

                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {pageItems.map((listing) => renderListing(listing, false))}
                  {primary.length === 0 && related.length === 0 && !group.error && (
                    <li className="text-sm text-foreground-muted">No matching titles</li>
                  )}
                </ul>

                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-sm text-foreground-muted">
                    <button
                      onClick={() => setPage(group.source, page - 1)}
                      disabled={page <= 1}
                      className="btn-secondary px-3 text-sm"
                    >
                      Prev
                    </button>
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(group.source, page + 1)}
                      disabled={page >= totalPages}
                      className="btn-secondary px-3 text-sm"
                    >
                      Next
                    </button>
                  </div>
                )}

                {related.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground-muted">
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
        <p className="text-base text-foreground-muted">
          Nothing came back from the sources that are set up. The keyless boards work without keys; the others need one in .env.local. You can also add a role by hand below.
        </p>
      )}
    </div>
  );
}
