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
  const [recommended, setRecommended] = useState<Listing[]>([]);
  const [relatedSearchTerms, setRelatedSearchTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tracked, setTracked] = useState<Set<string>>(new Set());

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
      setRecommended(data.recommended ?? []);
      setRelatedSearchTerms(data.relatedSearchTerms ?? []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(keywords, location, remoteOnly);
  }

  async function searchRelatedTerm(term: string) {
    setKeywords(term);
    await runSearch(term, location, remoteOnly);
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

  function ListingRow({ listing }: { listing: Listing }) {
    return (
      <li className="card-soft flex items-center justify-between p-3 text-sm">
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
    );
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

      {relatedSearchTerms.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground-muted">Widen your search:</span>
          {relatedSearchTerms.map((term) => (
            <button
              key={term}
              onClick={() => searchRelatedTerm(term)}
              disabled={loading}
              className="rounded-full border border-border-soft bg-surface px-3 py-1 text-xs text-primary-dark transition-all hover:border-primary/40 hover:bg-primary-light/15 disabled:opacity-50"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {recommended.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-primary-dark">Recommended for you</h2>
          <ul className="space-y-2">
            {recommended.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </ul>
        </div>
      )}

      {results.map((group) => (
        <div key={group.source} className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-foreground-muted">
            {group.label} {group.error && <span className="text-danger-dark">— {group.error}</span>}
          </h2>
          <ul className="space-y-2">
            {group.listings.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
            {group.listings.length === 0 && !group.error && (
              <li className="text-xs text-foreground-muted">No results</li>
            )}
          </ul>
        </div>
      ))}

      {searched && results.length === 0 && (
        <p className="text-sm text-foreground-muted">
          No sources are configured yet — add API keys in .env.local to start searching.
        </p>
      )}
    </div>
  );
}
