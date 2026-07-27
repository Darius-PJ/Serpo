"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownLite } from "./MarkdownLite";

interface Lead {
  id: string;
  company: string;
  roleTitle: string;
  jobType: string;
  location?: string | null;
  keyword: string;
  salaryOrRate?: string | null;
  rank: number;
  explanation: string;
  sourceUrl: string;
  duplicateVariantsSuppressed?: string | null;
}

interface Report {
  id: string;
  batchSize: number;
  keyword: string;
  location?: string | null;
  jobType?: string | null;
  compensationTarget?: string | null;
  sourcesHubMarkdown?: string | null;
  status: string;
  error?: string | null;
}

const BATCH_SIZE_OPTIONS = [5, 10, 15];

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function suppressedCount(lead: Lead): number {
  if (!lead.duplicateVariantsSuppressed) return 0;
  try {
    const parsed = JSON.parse(lead.duplicateVariantsSuppressed);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function RaekwonPanel({
  initialReport,
  initialLeads,
}: {
  initialReport: Report | null;
  initialLeads: Lead[];
}) {
  const router = useRouter();
  const [batchSize, setBatchSize] = useState(initialReport?.batchSize ?? 10);
  const [keyword, setKeyword] = useState(initialReport?.keyword ?? "");
  const [location, setLocation] = useState(initialReport?.location ?? "");
  const [jobType, setJobType] = useState(initialReport?.jobType ?? "");
  const [compensationTarget, setCompensationTarget] = useState(initialReport?.compensationTarget ?? "");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<Report | null>(initialReport);
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(
    initialReport?.status === "failed" ? (initialReport.error ?? "Generation failed.") : null
  );

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/raekwon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize, keyword, location, jobType: jobType || undefined, compensationTarget }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setReport(data.report ?? null);
      setLeads(data.leads ?? []);
      if (data.report?.status === "failed") {
        setError(data.report.error ?? "Generation failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong generating leads.");
    } finally {
      setGenerating(false);
    }
  }

  async function track(lead: Lead) {
    await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: lead.company,
        role: lead.roleTitle,
        source: sourceHost(lead.sourceUrl),
        url: lead.sourceUrl,
        description: lead.explanation,
        status: "Sourced",
      }),
    });
    setTracked((prev) => new Set(prev).add(lead.id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={generate} className="card-soft flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-muted">Keyword</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. backend engineer"
            required
            className="input-soft w-52 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-muted">Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" className="input-soft w-40 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-muted">Job type</label>
          <select value={jobType} onChange={(e) => setJobType(e.target.value)} className="input-soft px-2 py-1.5 text-sm">
            <option value="">Any</option>
            <option value="full-time">Full-time</option>
            <option value="contract">Contract</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-muted">Salary / hourly rate target</label>
          <input
            value={compensationTarget}
            onChange={(e) => setCompensationTarget(e.target.value)}
            placeholder="e.g. $120k+ or $60/hr"
            className="input-soft w-48 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-muted">Batch size</label>
          <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="input-soft px-2 py-1.5 text-sm">
            {BATCH_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={generating} className="btn-primary px-4 py-2 text-sm">
          {generating ? "Cooking… (up to 2 min)" : "Generate"}
        </button>
      </form>

      {error && <p className="text-sm text-danger-dark">{error}</p>}

      {leads.length > 0 && (
        <div className="cloud-cell overflow-x-auto p-4">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs font-bold uppercase tracking-wide text-primary-dark">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Company</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Location</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Compensation</th>
                <th className="pb-2 pr-3">Source</th>
                <th className="pb-2 pr-3">Why</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border-soft align-top last:border-0">
                  <td className="py-2 pr-3 text-foreground-muted">{lead.rank}</td>
                  <td className="py-2 pr-3 font-semibold text-foreground">{lead.company}</td>
                  <td className="py-2 pr-3">
                    {lead.roleTitle}
                    <div className="text-xs text-foreground-muted">via &quot;{lead.keyword}&quot;</div>
                  </td>
                  <td className="py-2 pr-3 text-foreground-muted">{lead.location ?? "—"}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{lead.jobType}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{lead.salaryOrRate ?? "—"}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{sourceHost(lead.sourceUrl)}</td>
                  <td className="py-2 pr-3 max-w-xs text-foreground-muted">
                    {lead.explanation}
                    {suppressedCount(lead) > 0 && (
                      <div className="mt-1 text-xs text-foreground-muted italic">+{suppressedCount(lead)} similar posting(s) suppressed</div>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary px-2.5 py-1 text-xs">
                        Open
                      </a>
                      <button onClick={() => track(lead)} disabled={tracked.has(lead.id)} className="btn-primary px-2.5 py-1 text-xs">
                        {tracked.has(lead.id) ? "Tracked" : "Track"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report?.sourcesHubMarkdown && (
        <div className="card-soft p-4">
          <h2 className="mb-2 font-bold text-foreground">Best-performing sources</h2>
          <MarkdownLite markdown={report.sourcesHubMarkdown} />
        </div>
      )}
    </div>
  );
}
