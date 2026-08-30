"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Done/snooze controls for one task. Snooze hides it from the attention queue
 * for a day, so the button only appears where the queue is (the dashboard).
 */
export function TaskActions({ taskId, title, showSnooze = true }: { taskId: string; title: string; showSnooze?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function patch(body: { completed: true } | { snoozeDays: number }) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    startTransition(() => router.refresh());
  }

  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        type="button"
        disabled={isPending}
        onClick={() => patch({ completed: true })}
        aria-label={`Complete task: ${title}`}
        className="btn-primary px-2 py-0.5 text-xs"
      >
        Done
      </button>
      {showSnooze && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => patch({ snoozeDays: 1 })}
          aria-label={`Snooze task: ${title}`}
          className="input-soft px-2 py-0.5 text-xs font-medium text-foreground-muted hover:text-primary-dark"
        >
          Snooze 1d
        </button>
      )}
    </span>
  );
}
