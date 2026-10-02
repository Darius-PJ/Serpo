"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { announceNewListingsChanged } from "./SideNav";
import { CADENCES, JOBSPY_CADENCES, isCadence, type Cadence } from "@/lib/automation/cadence";
import { errorMessage, requestJson } from "@/lib/http/requestJson";
import type { SavedSearchHitView, SavedSearchRun, SavedSearchSummary } from "@/lib/savedSearches/savedSearches";

/** A saved search as the Sourcing page hands it to the client: dates as ISO strings. */
export type SavedSearchItem = Omit<SavedSearchSummary, "lastRunAt" | "nextRunAt"> & { lastRunAt: string | null; nextRunAt: string };
type Hit = Omit<SavedSearchHitView, "firstSeenAt"> & { firstSeenAt: string };
type SearchPatch = { cadence?: Cadence; enabled?: boolean };

const JSON_HEADERS = { "Content-Type": "application/json" };

function describeCriteria(search: SavedSearchItem): string {
  const parts = [search.keywords];
  if (search.location) parts.push(search.location);
  if (search.remoteOnly) parts.push("Remote only");
  if (search.employmentType === "contract") parts.push("Contract & temp");
  const boards = search.jobSpySites.length;
  parts.push(boards === 0 ? "No JobSpy boards" : `${boards} JobSpy board${boards === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function describeRun(run: SavedSearchRun): string {
  const found = `Found ${run.newHits} new listing${run.newHits === 1 ? "" : "s"}.`;
  return run.failedSources.length > 0 ? `${found} These sources failed: ${run.failedSources.join(", ")}.` : found;
}

// Opening an inbox marks it viewed, so a refetch reports every hit as seen;
// hits already on screen keep the New marker they arrived with.
function mergeHits(shown: Hit[] | undefined, fetched: Hit[]): Hit[] {
  const shownNew = new Set((shown ?? []).filter((hit) => hit.isNew).map((hit) => hit.id));
  return fetched.map((hit) => (shownNew.has(hit.id) ? { ...hit, isNew: true } : hit));
}

/**
 * Saved searches on Sourcing, each with its triage inbox of hits. Nothing a
 * run finds reaches the pipeline until the user clicks Track.
 */
export function SavedSearchesPanel({
  searches,
  automationEnabled,
  initialOpenId,
}: {
  searches: SavedSearchItem[];
  automationEnabled: boolean;
  /** From ?savedSearch=: the dashboard's new-listings link opens that inbox. */
  initialOpenId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticSearches, applyOptimisticPatch] = useOptimistic(
    searches,
    (state, change: { id: string; patch: SearchPatch }) =>
      state.map((search) => (search.id === change.id ? { ...search, ...change.patch } : search)),
  );
  const linkedId = initialOpenId && searches.some((search) => search.id === initialOpenId) ? initialOpenId : null;
  const [openId, setOpenId] = useState<string | null>(linkedId);
  const [hitsBySearch, setHitsBySearch] = useState<Record<string, Hit[]>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runSummaries, setRunSummaries] = useState<Record<string, string>>({});
  const [actingHit, setActingHit] = useState<{ id: string; action: "track" | "dismiss" } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedSearchItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Counts changed on the server: re-render this page and refetch the nav badge.
  function refreshCounts() {
    router.refresh();
    announceNewListingsChanged();
  }

  function requestHits(searchId: string): Promise<Hit[]> {
    return requestJson<{ hits: Hit[] }>(`/api/saved-searches/${searchId}/hits`, { cache: "no-store" }).then((data) => data.hits);
  }

  /** With onlyIfLoaded, only an inbox opened before is updated. */
  function showHits(searchId: string, hits: Hit[], onlyIfLoaded = false) {
    setHitsBySearch((current) =>
      onlyIfLoaded && !current[searchId] ? current : { ...current, [searchId]: mergeHits(current[searchId], hits) },
    );
  }

  /**
   * GETs the inbox, shows it, then marks it viewed so the counts and the badge
   * drop. State changes only in promise callbacks, so the auto-open effect may
   * call it; that caller also reveals the inbox.
   */
  function openInbox(searchId: string, reveal = false): Promise<void> {
    return requestHits(searchId)
      .then((hits) => {
        if (reveal) setOpenId(searchId);
        showHits(searchId, hits);
        return requestJson(`/api/saved-searches/${searchId}/viewed`, { method: "POST", headers: JSON_HEADERS });
      })
      .then(() => refreshCounts())
      .catch((cause: unknown) => {
        setError(errorMessage(cause, "The listings could not be loaded."));
        setOpenId((current) => (current === searchId ? null : current));
      });
  }

  // Arriving from the dashboard's new-listings link opens that inbox.
  useEffect(() => {
    if (linkedId) void openInbox(linkedId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedId]);

  function toggleInbox(searchId: string) {
    setError(null);
    if (openId === searchId) {
      setOpenId(null);
      return;
    }
    setOpenId(searchId);
    void openInbox(searchId);
  }

  function updateSearch(search: SavedSearchItem, patch: SearchPatch) {
    setError(null);
    startTransition(async () => {
      applyOptimisticPatch({ id: search.id, patch });
      try {
        await requestJson(`/api/saved-searches/${search.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify(patch),
        });
      } catch (cause) {
        setError(errorMessage(cause, "The saved search could not be updated."));
      } finally {
        router.refresh();
      }
    });
  }

  async function runNow(search: SavedSearchItem) {
    setRunningId(search.id);
    setError(null);
    try {
      const { run } = await requestJson<{ run: SavedSearchRun }>(`/api/saved-searches/${search.id}/run`, {
        method: "POST",
        headers: JSON_HEADERS,
      });
      setRunSummaries((current) => ({ ...current, [search.id]: describeRun(run) }));
      refreshCounts();
    } catch (cause) {
      setError(errorMessage(cause, "The search could not be run."));
      return;
    } finally {
      setRunningId(null);
    }
    try {
      // An inbox opened earlier shows what this run added.
      showHits(search.id, await requestHits(search.id), true);
    } catch (cause) {
      setError(errorMessage(cause, "The listings could not be refreshed."));
    }
  }

  function removeHit(searchId: string, hitId: string) {
    setHitsBySearch((current) => ({ ...current, [searchId]: (current[searchId] ?? []).filter((hit) => hit.id !== hitId) }));
  }

  // The same request as tracking a search result: the listing enters the pipeline as Sourced.
  async function track(searchId: string, hit: Hit) {
    setActingHit({ id: hit.id, action: "track" });
    setError(null);
    try {
      await requestJson("/api/applications", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          company: hit.listing.company,
          role: hit.listing.role,
          source: hit.listing.source,
          url: hit.listing.url,
          description: hit.listing.description,
          status: "Sourced",
        }),
      });
      removeHit(searchId, hit.id);
      refreshCounts();
    } catch (cause) {
      setError(errorMessage(cause, "This job could not be added to your applications."));
    } finally {
      setActingHit(null);
    }
  }

  async function dismiss(searchId: string, hit: Hit) {
    setActingHit({ id: hit.id, action: "dismiss" });
    setError(null);
    try {
      await requestJson(`/api/saved-searches/${searchId}/hits/${hit.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ dismissed: true }),
      });
      removeHit(searchId, hit.id);
      refreshCounts();
    } catch (cause) {
      setError(errorMessage(cause, "This listing could not be dismissed."));
    } finally {
      setActingHit(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await requestJson(`/api/saved-searches/${pendingDelete.id}`, { method: "DELETE", headers: JSON_HEADERS });
      setPendingDelete(null);
      refreshCounts();
    } catch (cause) {
      setDeleteError(errorMessage(cause, "The saved search could not be deleted."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="saved-searches-heading" className="card-soft mb-6 p-4">
      <h2 id="saved-searches-heading" className="mb-1 text-lg font-bold text-heading">
        Saved searches
      </h2>
      <p className="mb-3 text-base text-foreground-muted">
        {automationEnabled ? (
          "Each search runs on its schedule while Serpo is open. What it finds waits here until you track or dismiss it."
        ) : (
          <>
            Automatic runs are off; turn them on in{" "}
            <Link href="/settings" className="link-accent">
              Settings
            </Link>
            . Run now always works.
          </>
        )}
      </p>
      {error && <p role="alert" className="mb-3 text-base text-danger-dark">{error}</p>}

      <ul className="space-y-3">
        {optimisticSearches.map((search) => {
          const isOpen = openId === search.id;
          const hits = hitsBySearch[search.id];
          const hasJobSpy = search.jobSpySites.length > 0;
          return (
            <li key={search.id} className="rounded-2xl border border-border-soft bg-surface p-3 text-base">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground">{search.name}</h3>
                {search.newCount > 0 && (
                  <span className="rounded-full border border-border-soft px-2 py-0.5 text-sm font-semibold text-foreground">
                    {search.newCount} new
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground-muted">{describeCriteria(search)}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground-muted">
                <label className="flex items-center gap-2">
                  How often
                  <select
                    value={search.cadence}
                    onChange={(e) => {
                      if (isCadence(e.target.value)) updateSearch(search, { cadence: e.target.value });
                    }}
                    className="input-soft px-2 py-1 text-sm"
                  >
                    {CADENCES.map(({ value, label }) => (
                      <option key={value} value={value} disabled={hasJobSpy && !JOBSPY_CADENCES.includes(value)}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={search.enabled}
                    onChange={(e) => updateSearch(search, { enabled: e.target.checked })}
                    className="accent-primary"
                  />
                  Run on schedule
                </label>
                <span>
                  {search.lastRunAt ? (
                    <>
                      Last run{" "}
                      <time dateTime={search.lastRunAt} suppressHydrationWarning>
                        {new Date(search.lastRunAt).toLocaleString()}
                      </time>
                    </>
                  ) : (
                    "Not run yet"
                  )}
                </span>
              </div>
              {hasJobSpy && <p className="mt-1 text-sm text-foreground-muted">Searches that include JobSpy boards run at most once a day.</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => runNow(search)}
                  disabled={runningId === search.id}
                  className="btn-primary px-3 text-sm"
                >
                  {runningId === search.id ? "Running…" : "Run now"}
                </button>
                <button type="button" onClick={() => toggleInbox(search.id)} aria-expanded={isOpen} className="btn-secondary px-3 text-sm">
                  {isOpen ? "Hide listings" : "Show listings"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setPendingDelete(search);
                  }}
                  className="btn-danger-outline px-3 text-sm"
                >
                  Delete
                </button>
              </div>
              {runSummaries[search.id] && <p role="status" className="mt-2 text-sm text-foreground-muted">{runSummaries[search.id]}</p>}

              {isOpen && (
                <div className="mt-3">
                  {hits === undefined ? (
                    <p className="text-sm text-foreground-muted">Loading listings…</p>
                  ) : hits.length === 0 ? (
                    <p className="text-sm text-foreground-muted">
                      Nothing waiting here. Listings a run finds stay until you track or dismiss them.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {hits.map((hit) => {
                        const acting = actingHit?.id === hit.id ? actingHit.action : null;
                        return (
                          <li key={hit.id} className="rounded-2xl border border-border-soft bg-surface-sunken p-3">
                            <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                              {hit.listing.role}
                              {hit.isNew && (
                                <span className="rounded-full border border-border-soft px-2 py-0.5 text-sm font-semibold text-foreground">
                                  New
                                </span>
                              )}
                            </div>
                            <div className="mb-2 text-foreground-muted">
                              {hit.listing.company}
                              {hit.listing.location ? ` · ${hit.listing.location}` : ""}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <a href={hit.listing.url} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 text-sm">
                                Open
                              </a>
                              <button
                                type="button"
                                onClick={() => track(search.id, hit)}
                                disabled={acting !== null}
                                className="btn-primary px-3 text-sm"
                              >
                                {acting === "track" ? "Tracking…" : "Track"}
                              </button>
                              <button
                                type="button"
                                onClick={() => dismiss(search.id, hit)}
                                disabled={acting !== null}
                                className="btn-secondary px-3 text-sm"
                              >
                                {acting === "dismiss" ? "Dismissing…" : "Dismiss"}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title="Delete this saved search?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" and the listings waiting in it will be deleted. Jobs you already tracked stay on your pipeline.`
            : ""
        }
        confirmLabel="Delete search"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        {deleteError && <p role="alert" className="text-base text-danger-dark">{deleteError}</p>}
      </ConfirmDialog>
    </section>
  );
}
