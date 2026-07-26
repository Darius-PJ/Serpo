"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DecisionMaker } from "@/generated/prisma";
import { ConfirmDialog } from "./ConfirmDialog";
import { guessDomainFromCompany } from "@/lib/osint/guessDomain";

export function DecisionMakerPanel({
  applicationId,
  company,
  decisionMakers,
}: {
  applicationId: string;
  company: string;
  decisionMakers: DecisionMaker[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [domain, setDomain] = useState(() => guessDomainFromCompany(company));

  async function research() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/decision-makers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      const toolError = data.runs?.find((r: { error?: string }) => r.error)?.error;
      if (toolError) setError(toolError);
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-soft mb-6 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold text-foreground">Decision makers</h2>
        <button onClick={() => setConfirmOpen(true)} disabled={loading} className="btn-primary px-3 py-1.5 text-xs">
          {loading ? "Researching…" : "Find decision maker"}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-danger-dark">{error}</p>}
      {decisionMakers.length === 0 ? (
        <p className="text-sm text-foreground-muted">None found yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {decisionMakers.map((d) => (
            <li key={d.id}>
              {d.name ?? "(name unknown)"} {d.title ? `— ${d.title}` : ""} {d.email ? `— ${d.email}` : ""}{" "}
              <span className="text-foreground-muted">via {d.sourceTool}</span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Research this domain?"
        description="This runs OSINT recon (theHarvester) against the domain below to try to find hiring-manager contacts. We guessed the domain from the company name — check it's actually correct before continuing."
        confirmLabel="Research"
        busy={loading}
        onConfirm={research}
        onCancel={() => setConfirmOpen(false)}
      >
        <label className="mb-1 block text-xs text-foreground-muted">Domain</label>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className="input-soft w-full px-2.5 py-1.5 text-sm"
        />
      </ConfirmDialog>
    </section>
  );
}
