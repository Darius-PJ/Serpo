"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INDUSTRIES, type IndustryId } from "@/lib/companies/industries";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export interface SuggestionView {
  key: string;
  name: string;
  platform: string;
  token: string;
  boardUrl: string;
  industryLabels: string[];
  reasons: string[];
}

export interface FollowedView {
  boardId: string;
  name: string;
  url: string;
  poolStatus: string | null;
}

export interface SearchView {
  id: string;
  keywords: string;
  location: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function FollowStatus({ poolStatus }: { poolStatus: string | null }) {
  if (poolStatus === "live") return <span className="text-primary-dark">Included in every search</span>;
  if (poolStatus === "failed") return <span className="text-danger-dark">Couldn&apos;t reach its job page</span>;
  if (poolStatus === "browse-only") return <span>Saved, but its openings can&apos;t be searched</span>;
  return <span>Not checked yet</span>;
}

export function CompaniesPanel({
  industries,
  suggestions,
  followed,
  searches,
  searchCount,
  hiddenCount,
  searchLimit,
}: {
  industries: IndustryId[];
  suggestions: SuggestionView[];
  followed: FollowedView[];
  searches: SearchView[];
  searchCount: number;
  hiddenCount: number;
  searchLimit: number;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<IndustryId[]>(industries);
  // One action at a time: each ends in a refresh that recomputes every list on the page.
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, failure: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, failure));
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function toggleIndustry(id: IndustryId) {
    const previous = picked;
    const next = previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id];
    setPicked(next);
    setError(null);
    try {
      await requestJson("/api/companies/industries", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ industries: next }) });
      router.refresh();
    } catch (cause) {
      setPicked(previous);
      setError(errorMessage(cause, "Your choice could not be saved."));
    }
  }

  // Follow = the same two steps as adding a board on Sourcing: save it privately,
  // then verify it into the search pool with a real request to the company's board.
  function follow(suggestion: SuggestionView) {
    return run(suggestion.key, `${suggestion.name} could not be followed.`, async () => {
      const { board } = await requestJson<{ board: { id: string } }>("/api/job-boards", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: suggestion.name, url: suggestion.boardUrl, jurisdiction: "other", source: "suggested" }),
      });
      await verify(board.id, suggestion.name);
    });
  }

  async function verify(boardId: string, name: string) {
    const { poolStatus } = await requestJson<{ poolStatus: string }>(`/api/job-boards/${boardId}/pool`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{}",
    });
    if (poolStatus !== "live") {
      throw new Error(`Serpo couldn't reach ${name}'s job page just now. It stays under Following; try Check again later.`);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-base text-danger-dark">{error}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="industries-heading" className="card-soft p-4">
            <h2 id="industries-heading" className="mb-1 font-bold text-heading">What kind of work interests you?</h2>
            <p className="mb-3 text-sm text-foreground-muted">Pick any that fit. Serpo suggests companies in those fields.</p>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((industry) => {
                const on = picked.includes(industry.id);
                return (
                  <button key={industry.id} type="button" className="chip" aria-pressed={on} onClick={() => toggleIndustry(industry.id)}>
                    {on && <span aria-hidden="true" className="mr-1">✓</span>}
                    {industry.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="suggestions-heading" className="card-soft p-4">
            <h2 id="suggestions-heading" className="mb-1 font-bold text-heading">
              Suggested companies{suggestions.length > 0 && ` (${suggestions.length})`}
            </h2>
            <p className="mb-3 text-sm text-foreground-muted">
              Nothing is followed until you choose Follow. Following checks the company&apos;s job page first.
            </p>
            {suggestions.length === 0 ? (
              <p className="text-sm text-foreground-muted">
                {picked.length === 0 && searchCount === 0
                  ? "Pick a field above, or run a search, and suggestions will appear here."
                  : "No more suggestions for what you picked. Try another field."}
              </p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((suggestion) => (
                  <li
                    key={suggestion.key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {suggestion.name}
                        <span className="font-normal text-foreground-muted"> · {suggestion.industryLabels.join(", ")}</span>
                      </p>
                      <p className="text-sm text-foreground-muted">{suggestion.reasons.join(" · ")}</p>
                      <a href={suggestion.boardUrl} target="_blank" rel="noopener noreferrer" className="link-accent text-sm">
                        See current openings
                      </a>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy !== null}
                        onClick={() => follow(suggestion)}
                        aria-label={busy === suggestion.key ? `Checking ${suggestion.name}…` : `Follow ${suggestion.name}`}
                      >
                        {busy === suggestion.key ? "Checking…" : "Follow"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy !== null}
                        aria-label={`Not interested in ${suggestion.name}`}
                        onClick={() =>
                          run(suggestion.key, "That suggestion could not be hidden.", async () => {
                            await requestJson("/api/companies/hidden", {
                              method: "POST",
                              headers: JSON_HEADERS,
                              body: JSON.stringify({ platform: suggestion.platform, token: suggestion.token }),
                            });
                          })
                        }
                      >
                        Not interested
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {hiddenCount > 0 && (
              <button
                type="button"
                className="link-accent mt-3 text-sm"
                disabled={busy !== null}
                onClick={() =>
                  run("hidden", "Hidden companies could not be restored.", async () => {
                    await requestJson("/api/companies/hidden", { method: "DELETE", headers: JSON_HEADERS, body: "{}" });
                  })
                }
              >
                Show {hiddenCount} hidden {hiddenCount === 1 ? "company" : "companies"} again
              </button>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="following-heading" className="card-soft p-4">
            <h2 id="following-heading" className="mb-2 font-bold text-heading">Following</h2>
            {followed.length === 0 ? (
              <p className="text-sm text-foreground-muted">You aren&apos;t following any companies yet.</p>
            ) : (
              <ul className="space-y-2">
                {followed.map((company) => (
                  <li key={company.boardId} className="rounded-xl border border-border-soft bg-surface px-3 py-2 text-sm">
                    <a href={company.url} target="_blank" rel="noopener noreferrer" className="link-accent">
                      {company.name}
                    </a>
                    <p className="text-foreground-muted">
                      <FollowStatus poolStatus={company.poolStatus} />
                    </p>
                    <div className="mt-1 flex gap-3">
                      {company.poolStatus !== "live" && (
                        <button
                          type="button"
                          className="link-accent"
                          disabled={busy !== null}
                          aria-label={`Check ${company.name} again`}
                          onClick={() => run(company.boardId, `${company.name} could not be checked.`, () => verify(company.boardId, company.name))}
                        >
                          {busy === company.boardId ? "Checking…" : "Check again"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-foreground-muted hover:text-danger-dark"
                        disabled={busy !== null}
                        aria-label={`Unfollow ${company.name}`}
                        onClick={() =>
                          run(company.boardId, `${company.name} could not be unfollowed.`, async () => {
                            await requestJson(`/api/job-boards/${company.boardId}`, { method: "DELETE", headers: JSON_HEADERS, body: "{}" });
                          })
                        }
                      >
                        Unfollow
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="history-heading" className="card-soft p-4">
            <h2 id="history-heading" className="mb-1 font-bold text-heading">Your recent searches</h2>
            <p className="mb-3 text-sm text-foreground-muted">
              Kept only on this computer, to suggest companies. Serpo keeps your last {searchLimit} searches.
            </p>
            {searches.length === 0 ? (
              <p className="text-sm text-foreground-muted">Searches you run on Sourcing or the dashboard appear here.</p>
            ) : (
              <>
                <ul className="mb-3 space-y-1 text-sm">
                  {searches.map((search) => (
                    <li key={search.id}>
                      {search.keywords}
                      {search.location && <span className="text-foreground-muted"> · {search.location}</span>}
                    </li>
                  ))}
                </ul>
                {searchCount > searches.length && (
                  <p className="mb-3 text-sm text-foreground-muted">and {searchCount - searches.length} earlier</p>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy !== null}
                  onClick={() =>
                    run("history", "Search history could not be cleared.", async () => {
                      await requestJson("/api/search-history", { method: "DELETE", headers: JSON_HEADERS, body: "{}" });
                    })
                  }
                >
                  Clear search history
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
