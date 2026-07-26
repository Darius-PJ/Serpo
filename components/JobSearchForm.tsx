"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export function JobSearchForm() {
  const router = useRouter();
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [tracked, setTracked] = useState<Set<string>>(new Set());

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, location, remoteOnly }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
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

  return (
    <div>
      <form onSubmit={search} className="card-soft mb-6 flex flex-wrap gap-2 p-4">
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Keywords (e.g. backend engineer)"
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
        <button type="submit" disabled={loading} className="btn-primary px-4 py-2 text-sm">
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {results.map((group) => (
        <div key={group.source} className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-foreground-muted">
            {group.label} {group.error && <span className="text-danger-dark">— {group.error}</span>}
          </h2>
          <ul className="space-y-2">
            {group.listings.map((listing) => (
              <li key={listing.id} className="card-soft flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-semibold text-foreground">{listing.role}</div>
                  <div className="text-foreground-muted">
                    {listing.company}
                    {listing.location ? ` · ${listing.location}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={listing.url} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 py-1.5">
                    Open posting
                  </a>
                  <button onClick={() => track(listing)} disabled={tracked.has(listing.id)} className="btn-primary px-3 py-1.5">
                    {tracked.has(listing.id) ? "Tracked" : "Track"}
                  </button>
                </div>
              </li>
            ))}
            {group.listings.length === 0 && !group.error && (
              <li className="text-xs text-foreground-muted">No results</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
