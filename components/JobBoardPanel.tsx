"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { JobBoard } from "@/generated/prisma";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

type BoardWithPool = JobBoard & { poolStatus: string | null; integrationType: string | null };

interface GathererFind {
  name: string;
  url: string;
  category: "jobBoard" | "trainingProgram" | "govOpportunity";
  description: string;
}

interface IntegrationGuide {
  explanation: string;
  suggestedApproach: "api" | "scrape" | "bookmark-only" | "not-a-job-source";
  codeSnippet?: string;
}

const CATEGORY_LABELS: Record<GathererFind["category"], string> = {
  jobBoard: "Job boards & aggregators",
  trainingProgram: "Training & workforce programs",
  govOpportunity: "Government IT opportunities",
};

const COLLAPSIBLE_JURISDICTIONS = new Set(["state", "municipal"]);

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}>
      <path
        fillRule="evenodd"
        d="M6.22 4.22a.75.75 0 0 1 1.06 0l5 5a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06-1.06L10.94 10 6.22 5.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PoolButton({ board, loading, onAdd }: { board: BoardWithPool; loading: boolean; onAdd: () => void }) {
  if (loading) {
    return (
      <span className="text-foreground-muted" title="Verifying…">
        …
      </span>
    );
  }
  if (board.poolStatus === "live") {
    return (
      <span className="flex items-center text-primary-dark" title="Live in your search pool">
        <CheckIcon />
      </span>
    );
  }
  if (board.poolStatus === "browse-only") {
    return (
      <span className="text-foreground-muted" title="Saved — link verified, but not live-searchable">
        saved
      </span>
    );
  }
  if (board.poolStatus === "failed") {
    return (
      <button onClick={onAdd} className="text-danger-dark hover:underline" title="Verification failed — click to retry">
        retry
      </button>
    );
  }
  return (
    <button onClick={onAdd} className="text-foreground-muted hover:text-primary-dark" title="Add to search pool">
      add
    </button>
  );
}

export function JobBoardPanel({ boards }: { boards: BoardWithPool[] }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(COLLAPSIBLE_JURISDICTIONS));
  const [poolLoading, setPoolLoading] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);

  const [gatherQuery, setGatherQuery] = useState("");
  const [gathering, setGathering] = useState(false);
  const [finds, setFinds] = useState<GathererFind[]>([]);

  const [guideTarget, setGuideTarget] = useState<GathererFind | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guide, setGuide] = useState<IntegrationGuide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const grouped = boards.reduce<Record<string, BoardWithPool[]>>((acc, b) => {
    (acc[b.jurisdiction] ??= []).push(b);
    return acc;
  }, {});

  function toggleJurisdiction(jurisdiction: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(jurisdiction)) next.delete(jurisdiction);
      else next.add(jurisdiction);
      return next;
    });
  }

  async function togglePin(board: BoardWithPool) {
    setError(null);
    try {
      await requestJson(`/api/job-boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !board.pinned }),
      });
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The board could not be updated."));
    }
  }

  async function addToPool(board: BoardWithPool) {
    setPoolLoading((prev) => new Set(prev).add(board.id));
    setError(null);
    try {
      await requestJson(`/api/job-boards/${board.id}/pool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The board could not be verified."));
    } finally {
      setPoolLoading((prev) => {
        const next = new Set(prev);
        next.delete(board.id);
        return next;
      });
    }
  }

  async function addBoard(board: { name: string; url: string; jurisdiction: string; region?: string }) {
    setError(null);
    try {
      await requestJson("/api/job-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...board, source: "manual" }),
      });
      setShowAddForm(false);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The board could not be saved."));
      throw cause;
    }
  }

  async function gather(e: React.FormEvent) {
    e.preventDefault();
    if (!gatherQuery.trim()) return;
    setGathering(true);
    setError(null);
    try {
      const data = await requestJson<{ finds?: GathererFind[] }>("/api/job-boards/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: gatherQuery }),
      });
      setFinds(data.finds ?? []);
    } catch (cause) {
      setError(errorMessage(cause, "Resource discovery could not be completed."));
    } finally {
      setGathering(false);
    }
  }

  async function openGuide(find: GathererFind) {
    setGuideTarget(find);
    setGuide(null);
    setGuideLoading(true);
    setError(null);
    dialogRef.current?.showModal();
    try {
      const data = await requestJson<{ guide?: IntegrationGuide }>("/api/job-boards/gather/integration-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: find.name, url: find.url, category: find.category }),
      });
      setGuide(data.guide ?? null);
    } catch (cause) {
      setError(errorMessage(cause, "The integration guide could not be generated."));
    } finally {
      setGuideLoading(false);
    }
  }

  function closeGuide() {
    dialogRef.current?.close();
  }

  const findsByCategory = finds.reduce<Partial<Record<GathererFind["category"], GathererFind[]>>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-danger-dark">{error}</p>}
      <section className="card-soft p-4">
        <h2 className="mb-2 font-bold text-foreground">Job boards &amp; resources</h2>

        {Object.entries(grouped).map(([jurisdiction, list]) => {
          const isCollapsible = COLLAPSIBLE_JURISDICTIONS.has(jurisdiction);
          const isExpanded = !isCollapsible || !collapsed.has(jurisdiction);
          return (
            <div key={jurisdiction} className="mb-2">
              {isCollapsible ? (
                <button
                  type="button"
                  onClick={() => toggleJurisdiction(jurisdiction)}
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary-dark"
                >
                  <ChevronIcon expanded={isExpanded} />
                  {jurisdiction} ({list.length})
                </button>
              ) : (
                <h3 className="text-xs font-bold uppercase tracking-wide text-primary-dark">
                  {jurisdiction} ({list.length})
                </h3>
              )}
              {isExpanded && (
                <ul className="mt-1 space-y-1">
                  {list.map((board) => (
                    <li
                      key={board.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border-soft bg-surface px-3 py-1.5 text-xs"
                    >
                      <a href={board.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                        {board.name}
                      </a>
                      <span className="flex shrink-0 items-center gap-2">
                        <PoolButton board={board} loading={poolLoading.has(board.id)} onAdd={() => addToPool(board)} />
                        <button onClick={() => togglePin(board)} className="text-foreground-muted hover:text-danger-dark" title="Unpin">
                          {board.pinned ? "×" : "+"}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <button type="button" onClick={() => setShowAddForm((v) => !v)} className="btn-secondary mt-2 px-3 py-1 text-xs">
          Add a board
        </button>
        {showAddForm && <AddBoardForm onAdd={addBoard} />}
      </section>

      <section className="card-soft p-4">
        <h2 className="mb-1 font-bold text-foreground">Resource discovery</h2>
        <p className="mb-3 text-xs text-foreground-muted">
          Searches the internet for new job boards, government training programs, and government IT
          opportunities. Nothing is added automatically — each find gets you a script and instructions.
        </p>
        <form onSubmit={gather} className="flex gap-2">
          <input
            value={gatherQuery}
            onChange={(e) => setGatherQuery(e.target.value)}
            placeholder="A location, industry, or niche…"
            className="input-soft flex-1 px-2.5 py-1 text-sm"
          />
          <button type="submit" disabled={gathering} className="btn-secondary px-3 py-1 text-sm">
            {gathering ? "Gathering…" : "Gather"}
          </button>
        </form>

        {(Object.entries(findsByCategory) as [GathererFind["category"], GathererFind[]][]).map(([category, categoryFinds]) => (
          <div key={category} className="mt-3">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-primary-dark">{CATEGORY_LABELS[category]}</h3>
            <ul className="space-y-1">
              {categoryFinds.map((find) => (
                <li key={find.url} className="rounded-xl border border-border-soft bg-surface p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <a href={find.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      {find.name}
                    </a>
                    <button onClick={() => openGuide(find)} className="btn-primary shrink-0 px-2 py-0.5 text-xs">
                      Integration guide
                    </button>
                  </div>
                  <p className="text-foreground-muted">{find.description}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <dialog
        ref={dialogRef}
        onClose={() => {
          setGuideTarget(null);
          setGuide(null);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) closeGuide();
        }}
        className="card-soft fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-0 backdrop:bg-primary-dark/20 backdrop:backdrop-blur-sm"
      >
        <div className="p-4">
          <h2 className="mb-2 font-bold text-foreground">{guideTarget?.name}</h2>
          {guideLoading && <p className="text-sm text-foreground-muted">Asking Claude how this could be integrated…</p>}
          {guide && (
            <div className="text-sm">
              <p className="mb-2 text-foreground-muted">{guide.explanation}</p>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-dark">
                Suggested approach: {guide.suggestedApproach}
              </p>
              {guide.codeSnippet && (
                <pre className="max-h-64 overflow-auto rounded-xl border border-border-soft bg-background p-2 text-xs">
                  <code>{guide.codeSnippet}</code>
                </pre>
              )}
              <p className="mt-2 text-xs text-foreground-muted">
                AI-generated and not automatically installed — review before adding this to the codebase.
              </p>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button onClick={closeGuide} className="btn-secondary px-3 py-1.5 text-sm">
              Close
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function AddBoardForm({ onAdd }: { onAdd: (b: { name: string; url: string; jurisdiction: string; region?: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [jurisdiction, setJurisdiction] = useState("other");
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !url.trim()) return;
        setSaving(true);
        try {
          await onAdd({ name, url, jurisdiction });
          setName("");
          setUrl("");
        } catch {
          // The parent renders the server's actionable error; keep form input.
        } finally {
          setSaving(false);
        }
      }}
      className="mt-2 flex flex-wrap gap-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="input-soft px-2.5 py-1 text-xs" />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className="input-soft min-w-[160px] flex-1 px-2.5 py-1 text-xs"
      />
      <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className="input-soft px-2.5 py-1 text-xs">
        <option value="state">State</option>
        <option value="municipal">Municipal</option>
        <option value="federal">Federal</option>
        <option value="other">Other</option>
      </select>
      <button type="submit" disabled={saving} className="btn-primary px-3 py-1 text-xs">
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
