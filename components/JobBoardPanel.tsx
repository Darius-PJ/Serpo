"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JobBoard } from "@/generated/prisma";

interface Suggestion {
  name: string;
  url: string;
  jurisdiction: string;
  region: string;
}

export function JobBoardPanel({ boards }: { boards: JobBoard[] }) {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const grouped = boards.reduce<Record<string, JobBoard[]>>((acc, b) => {
    (acc[b.jurisdiction] ??= []).push(b);
    return acc;
  }, {});

  async function discover(e: React.FormEvent) {
    e.preventDefault();
    if (!location.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/job-boards/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function addBoard(board: { name: string; url: string; jurisdiction: string; region?: string }, source = "manual") {
    await fetch("/api/job-boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...board, source }),
    });
    setSuggestions((prev) => prev.filter((s) => s.url !== board.url));
    router.refresh();
  }

  async function togglePin(board: JobBoard) {
    await fetch(`/api/job-boards/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !board.pinned }),
    });
    router.refresh();
  }

  return (
    <section className="card-soft mb-6 p-4">
      <h2 className="mb-2 font-bold text-foreground">Job boards &amp; resources</h2>

      {Object.entries(grouped).map(([jurisdiction, list]) => (
        <div key={jurisdiction} className="mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-primary-dark">{jurisdiction}</h3>
          <ul className="flex flex-wrap gap-2">
            {list.map((board) => (
              <li
                key={board.id}
                className="flex items-center gap-1 rounded-full border border-border-soft bg-surface px-3 py-1 text-xs"
              >
                <a href={board.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {board.name}
                </a>
                <button onClick={() => togglePin(board)} className="text-foreground-muted hover:text-danger-dark" title="Unpin">
                  {board.pinned ? "×" : "+"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <form onSubmit={discover} className="mt-3 flex gap-2">
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Find more boards for a state/city…"
          className="input-soft flex-1 px-2.5 py-1 text-sm"
        />
        <button type="submit" disabled={loading} className="btn-secondary px-3 py-1 text-sm">
          {loading ? "Searching…" : "Find more"}
        </button>
        <button type="button" onClick={() => setShowAddForm((v) => !v)} className="btn-secondary px-3 py-1 text-sm">
          Add a board
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-2">
          <p className="mb-1 text-xs text-amber-800">
            AI-suggested — unverified, confirm the link works before relying on it.
          </p>
          <ul className="space-y-1 text-sm">
            {suggestions.map((s) => (
              <li key={s.url} className="flex items-center justify-between">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {s.name} <span className="text-foreground-muted">({s.region})</span>
                </a>
                <button
                  onClick={() => addBoard({ name: s.name, url: s.url, jurisdiction: s.jurisdiction, region: s.region }, "ai-discovered")}
                  className="btn-primary px-2 py-0.5 text-xs"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAddForm && <AddBoardForm onAdd={(b) => addBoard(b, "manual")} />}
    </section>
  );
}

function AddBoardForm({ onAdd }: { onAdd: (b: { name: string; url: string; jurisdiction: string; region?: string }) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [jurisdiction, setJurisdiction] = useState("other");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !url.trim()) return;
        onAdd({ name, url, jurisdiction });
        setName("");
        setUrl("");
      }}
      className="mt-3 flex flex-wrap gap-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="input-soft px-2.5 py-1 text-sm" />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className="input-soft min-w-[220px] flex-1 px-2.5 py-1 text-sm"
      />
      <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className="input-soft px-2.5 py-1 text-sm">
        <option value="state">State</option>
        <option value="municipal">Municipal</option>
        <option value="federal">Federal</option>
        <option value="other">Other</option>
      </select>
      <button type="submit" className="btn-primary px-3 py-1 text-sm">
        Save
      </button>
    </form>
  );
}
