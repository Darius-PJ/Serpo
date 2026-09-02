"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

/**
 * Done/snooze controls for one task. Snooze hides it from the attention queue
 * for a day, so the button only appears where the queue is (the dashboard).
 */
export function TaskActions({ taskId, title, showSnooze = true }: { taskId: string; title: string; showSnooze?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: { completed: true } | { snoozeDays: number }) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The task could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="shrink-0">
      <span className="flex gap-1.5">
        <button
          type="button"
          disabled={isPending || saving}
          onClick={() => patch({ completed: true })}
          aria-label={`Complete task: ${title}`}
          className="btn-primary px-2 py-0.5 text-xs"
        >
          Done
        </button>
        {showSnooze && (
          <button
            type="button"
            disabled={isPending || saving}
            onClick={() => patch({ snoozeDays: 1 })}
            aria-label={`Snooze task: ${title}`}
            className="input-soft px-2 py-0.5 text-xs font-medium text-foreground-muted hover:text-primary-dark"
          >
            Snooze 1d
          </button>
        )}
      </span>
      {error && <span role="alert" className="mt-1 block max-w-48 text-xs text-danger-dark">{error}</span>}
    </span>
  );
}
