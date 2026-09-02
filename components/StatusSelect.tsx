"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export function StatusSelect({ applicationId, status, label }: { applicationId: string; status: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The status could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <span>
      <select
        aria-label={label}
        value={status}
        disabled={saving || isPending}
        onChange={(e) => onChange(e.target.value)}
        className="input-soft px-2 py-1 text-xs font-medium"
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="ml-2 text-xs text-danger-dark">{error}</span>}
    </span>
  );
}
