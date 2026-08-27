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
  const [researchNotice, setResearchNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [domain, setDomain] = useState(() => guessDomainFromCompany(company));

  async function research() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    setResearchNotice(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/decision-makers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Decision-maker research could not be completed.");
        return;
      }
      const toolError = data.runs?.find((run: { error?: string }) => run.error)?.error;
      if (toolError) setError(toolError);
      setResearchNotice(
        data.limitReached
          ? `Saved ${data.created?.length ?? 0} contacts; the 50-contact safety limit was reached.`
          : `Saved ${data.created?.length ?? 0} new contacts. ${data.duplicatesSkipped ?? 0} duplicates were skipped.`
      );
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function purgeResearch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/privacy/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge-decision-makers", applicationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Saved research could not be deleted.");
        return;
      }
      setPurgeOpen(false);
      setResearchNotice(`Deleted ${data.result?.count ?? 0} saved contacts.`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-soft mb-6 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-bold text-foreground">Decision-maker research</h2>
        <div className="flex gap-2">
          {decisionMakers.length > 0 && (
            <button onClick={() => setPurgeOpen(true)} disabled={loading} className="btn-secondary px-3 py-1.5 text-xs">
              Delete research
            </button>
          )}
          <button onClick={() => setConfirmOpen(true)} disabled={loading} className="btn-primary px-3 py-1.5 text-xs">
            {loading ? "Researching..." : "Research contacts"}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-foreground-muted">
        Research may send the domain you approve to configured public-source tools. Results are saved only to this application. No message is sent automatically.
      </p>
      {error && <p role="alert" className="mb-2 text-xs text-danger-dark">{error}</p>}
      {researchNotice && <p className="mb-2 text-xs text-foreground-muted">{researchNotice}</p>}

      {decisionMakers.length === 0 ? (
        <p className="text-sm text-foreground-muted">No saved contacts yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {decisionMakers.map((decisionMaker) => (
            <li key={decisionMaker.id} className="rounded-lg border border-border-soft p-2">
              <div className="font-medium text-foreground">{decisionMaker.name ?? "Name not provided"}</div>
              {decisionMaker.title && <div className="text-foreground-muted">{decisionMaker.title}</div>}
              {decisionMaker.email && <div className="break-all text-foreground-muted">{decisionMaker.email}</div>}
              <div className="mt-1 text-xs text-foreground-muted">
                Source: {decisionMaker.sourceTool}{decisionMaker.confidence ? ` (${decisionMaker.confidence})` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Research this domain?"
        description="The domain below will be sent to configured public-source research tools. Check it carefully: it was guessed from the company name. The app stores returned contacts locally and will not message anyone."
        confirmLabel="Research"
        busy={loading}
        onConfirm={research}
        onCancel={() => setConfirmOpen(false)}
      >
        <label className="mb-1 block text-xs text-foreground-muted">Domain</label>
        <input
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="example.com"
          className="input-soft w-full px-2.5 py-1.5 text-sm"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={purgeOpen}
        tone="danger"
        title="Delete saved contact research?"
        description="This permanently removes all decision-maker contacts saved for this application. It does not change the application or its message drafts."
        confirmLabel="Delete research"
        busy={loading}
        onConfirm={purgeResearch}
        onCancel={() => setPurgeOpen(false)}
      />
    </section>
  );
}
