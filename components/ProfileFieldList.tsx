"use client";

import { useRouter } from "next/navigation";
import type { ProfileField } from "@/generated/prisma";
import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export function ProfileFieldList({ fields }: { fields: ProfileField[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await requestJson(`/api/profile-fields/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The saved answer could not be deleted."));
    } finally {
      setDeleting(null);
    }
  }

  if (fields.length === 0) {
    return <p className="text-base text-foreground-muted">No saved answers yet — they accumulate as auto-apply runs ask for them.</p>;
  }

  return (
    <div>
      {error && <p role="alert" className="mb-2 text-base text-danger-dark">{error}</p>}
      <ul className="space-y-2">
      {fields.map((f) => (
        <li key={f.id} className="card-soft flex items-center justify-between p-2 text-base">
          <div>
            <div className="font-semibold">{f.label}</div>
            <div className="text-foreground-muted">{f.value}</div>
          </div>
          <button disabled={deleting === f.id} onClick={() => remove(f.id)} className="btn-danger-outline px-2 py-1 text-sm">
            Delete
          </button>
        </li>
      ))}
      </ul>
    </div>
  );
}
