"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownLite } from "./MarkdownLite";

interface Lead {
  id: string;
  company: string;
  role: string;
  location?: string | null;
  url: string;
  sourceLabel: string;
  jobType: string;
  compensation?: string | null;
  rationale: string;
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

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/raekwon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize, keyword, location, jobType: jobType || undefined, compensationTarget }),
      });
      const data = await res.json();
      setReport(data.report ?? null);
      setLeads(data.leads ?? []);
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
        role: lead.role,
        source: lead.sourceLabel,
        url: lead.url,
        description: lead.rationale,
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
          {generating ? "Cooking…" : "Generate"}
        </button>
      </form>

      {report?.status === "failed" && (
        <p className="text-sm text-danger-dark">Generation failed: {report.error}</p>
      )}

      {leads.length > 0 && (
        <div className="cloud-cell overflow-x-auto p-4">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs font-bold uppercase tracking-wide text-primary-dark">
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
                  <td className="py-2 pr-3 font-semibold text-foreground">{lead.company}</td>
                  <td className="py-2 pr-3">{lead.role}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{lead.location ?? "—"}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{lead.jobType}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{lead.compensation ?? "—"}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{lead.sourceLabel}</td>
                  <td className="py-2 pr-3 max-w-xs text-foreground-muted">{lead.rationale}</td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      <a href={lead.url} target="_blank" rel="noopener noreferrer" className="btn-secondary px-2.5 py-1 text-xs">
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
