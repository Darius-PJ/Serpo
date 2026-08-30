"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { INTERACTION_DIRECTIONS, INTERACTION_KINDS } from "@/lib/contacts/types";

/** Log one touch with a contact from the /contacts page. */
export function InteractionLogForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<string>("email");
  const [direction, setDirection] = useState<string>("outbound");
  const [notes, setNotes] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await fetch(`/api/contacts/${contactId}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, direction, notes: notes || undefined }),
    });
    setNotes("");
    startTransition(() => router.refresh());
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
      <button type="submit" disabled={isPending} className="btn-primary px-2.5 py-1 text-xs">
        Log interaction
      </button>
    </form>
  );
}
