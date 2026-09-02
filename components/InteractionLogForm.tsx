"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { INTERACTION_DIRECTIONS, INTERACTION_KINDS } from "@/lib/contacts/types";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

/** Log one touch with a contact from the /contacts page. */
export function InteractionLogForm({ contactId, applicationId }: { contactId: string; applicationId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<string>("email");
  const [direction, setDirection] = useState<string>("outbound");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/contacts/${contactId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, direction, notes: notes || undefined, applicationId }),
      });
      setNotes("");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The interaction could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-center gap-1.5">
      <select
        value={kind}
        onChange={(event) => setKind(event.target.value)}
        aria-label="Interaction kind"
        className="input-soft px-2 py-1 text-xs"
      >
        {INTERACTION_KINDS.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <select
        value={direction}
        onChange={(event) => setDirection(event.target.value)}
        aria-label="Interaction direction"
        className="input-soft px-2 py-1 text-xs"
      >
        {INTERACTION_DIRECTIONS.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <input
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Note (optional)"
        aria-label="Interaction note"
        className="input-soft px-2 py-1 text-xs"
      />
      <button type="submit" disabled={saving || isPending} className="btn-primary px-2.5 py-1 text-xs">
        Log interaction
      </button>
      {error && <p role="alert" className="basis-full text-xs text-danger-dark">{error}</p>}
    </form>
  );
}
