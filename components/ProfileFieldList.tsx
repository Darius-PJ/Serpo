"use client";

import { useRouter } from "next/navigation";
import type { ProfileField } from "@/generated/prisma";

export function ProfileFieldList({ fields }: { fields: ProfileField[] }) {
  const router = useRouter();

  async function remove(id: string) {
    await fetch(`/api/profile-fields/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    router.refresh();
  }

  if (fields.length === 0) {
    return <p className="text-sm text-foreground-muted">No saved answers yet — they accumulate as auto-apply runs ask for them.</p>;
  }

  return (
    <ul className="space-y-2">
      {fields.map((f) => (
        <li key={f.id} className="card-soft flex items-center justify-between p-2 text-sm">
          <div>
            <div className="font-semibold">{f.label}</div>
            <div className="text-foreground-muted">{f.value}</div>
          </div>
          <button onClick={() => remove(f.id)} className="btn-danger-outline px-2 py-1 text-xs">
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
