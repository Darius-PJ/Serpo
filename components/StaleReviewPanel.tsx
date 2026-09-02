"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Application } from "@/generated/prisma";
import { ConfirmDialog } from "./ConfirmDialog";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export function StaleReviewPanel({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [pendingRemove, setPendingRemove] = useState<Application | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (applications.length === 0) return null;

  async function act(action: "keep" | "remove", applicationId: string) {
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/privacy/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, applicationId }),
      });
      setPendingRemove(null);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The application could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <h2 className="mb-2 font-bold text-accent-light">Review for removal</h2>
      <p className="mb-3 text-sm text-accent-light">
        No status change in 3+ months. Nothing is deleted until you choose Remove.
      </p>
      {error && <p role="alert" className="mb-3 text-sm text-danger-dark">{error}</p>}
      <ul className="space-y-2">
        {applications.map((app) => (
          <li key={app.id} className="flex items-center justify-between rounded-xl bg-surface p-2 text-sm">
            <span>
              {app.company} — {app.role}{" "}
              <span className="text-foreground-muted">
                (last updated {app.lastStatusChangeAt.toLocaleDateString()})
              </span>
            </span>
            <span className="flex gap-2">
              <button onClick={() => act("keep", app.id)} className="btn-secondary px-2 py-1 text-xs">
                Keep
              </button>
              <button onClick={() => setPendingRemove(app)} className="btn-danger-outline px-2 py-1 text-xs">
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingRemove !== null}
        tone="danger"
        title="Remove this application?"
        description={
          pendingRemove
            ? `Permanently delete ${pendingRemove.company} — ${pendingRemove.role}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => pendingRemove && act("remove", pendingRemove.id)}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );
}
