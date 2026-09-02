"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

/** Inline "add a task" form — standalone on the dashboard, application-linked on the detail page. */
export function TaskQuickAdd({ applicationId }: { applicationId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          ...(dueDate ? { dueAt: dueDate } : {}),
          ...(applicationId ? { applicationId } : {}),
        }),
      });
      setTitle("");
      setDueDate("");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The task could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add a task…"
        aria-label="New task title"
        className="input-soft px-2.5 py-1.5 text-sm"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
        aria-label="Due date"
        className="input-soft px-2 py-1.5 text-sm"
      />
      <button type="submit" disabled={saving || isPending} className="btn-primary px-3 py-1.5 text-sm">
        Add task
      </button>
      {error && <p role="alert" className="basis-full text-xs text-danger-dark">{error}</p>}
    </form>
  );
}
