"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Application } from "@/generated/prisma";
import { ConfirmDialog } from "./ConfirmDialog";

export function StaleReviewPanel({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [pendingRemove, setPendingRemove] = useState<Application | null>(null);
  const [busy, setBusy] = useState(false);

  if (applications.length === 0) return null;

  async function act(action: "keep" | "remove", applicationId: string) {
    setBusy(true);
    try {
      await fetch("/api/privacy/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, applicationId }),
      });
      setPendingRemove(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-2 font-semibold text-amber-900">Review for removal</h2>
      <p className="mb-3 text-sm text-amber-800">
        No status change in 3+ months. Nothing is deleted until you choose Remove.
      </p>
      <ul className="space-y-2">
        {applications.map((app) => (
          <li key={app.id} className="flex items-center justify-between rounded bg-white p-2 text-sm">
            <span>
              {app.company} — {app.role}{" "}
              <span className="text-neutral-500">
                (last updated {app.lastStatusChangeAt.toLocaleDateString()})
              </span>
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => act("keep", app.id)}
                className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
              >
                Keep
              </button>
              <button
                onClick={() => setPendingRemove(app)}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
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
