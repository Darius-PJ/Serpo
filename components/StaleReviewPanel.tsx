"use client";

import { useRouter } from "next/navigation";
import type { Application } from "@/generated/prisma";

export function StaleReviewPanel({ applications }: { applications: Application[] }) {
  const router = useRouter();

  if (applications.length === 0) return null;

  async function act(action: "keep" | "remove", applicationId: string) {
    await fetch("/api/privacy/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, applicationId }),
    });
    router.refresh();
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
                onClick={() => {
                  if (window.confirm(`Permanently delete ${app.company} — ${app.role}? This cannot be undone.`)) {
                    act("remove", app.id);
                  }
                }}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
