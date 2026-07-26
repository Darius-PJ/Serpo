"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DecisionMaker } from "@/generated/prisma";

export function DecisionMakerPanel({
  applicationId,
  decisionMakers,
}: {
  applicationId: string;
  decisionMakers: DecisionMaker[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function research() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/decision-makers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const toolError = data.runs?.find((r: { error?: string }) => r.error)?.error;
      if (toolError) setError(toolError);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6 rounded border border-neutral-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Decision makers</h2>
        <button
          onClick={research}
          disabled={loading}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {loading ? "Researching…" : "Find decision maker"}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {decisionMakers.length === 0 ? (
        <p className="text-sm text-neutral-500">None found yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {decisionMakers.map((d) => (
            <li key={d.id}>
              {d.name ?? "(name unknown)"} {d.title ? `— ${d.title}` : ""} {d.email ? `— ${d.email}` : ""}{" "}
              <span className="text-neutral-400">via {d.sourceTool}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
