"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

/** Queues a dead automation job for a fresh set of attempts; the next tick runs it. */
export function AutomationRetryButton({ jobId, label }: { jobId: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/automation/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The job could not be retried."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="shrink-0">
      <button
        type="button"
        disabled={isPending || saving}
        onClick={retry}
        aria-label={`Retry: ${label}`}
        className="btn-primary px-2 py-0.5 text-sm"
      >
        Retry
      </button>
      {error && <span role="alert" className="mt-1 block max-w-48 text-sm text-danger-dark">{error}</span>}
    </span>
  );
}
