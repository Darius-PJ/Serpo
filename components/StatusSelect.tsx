"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";

export function StatusSelect({ applicationId, status, label }: { applicationId: string; status: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onChange(next: string) {
    await fetch(`/api/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <select
      aria-label={label}
      value={status}
      disabled={isPending}
      onChange={(e) => onChange(e.target.value)}
      className="input-soft px-2 py-1 text-xs font-medium"
    >
      {APPLICATION_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
