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
    return <p className="text-sm text-neutral-500">No saved answers yet — they accumulate as auto-apply runs ask for them.</p>;
  }

  return (
    <ul className="space-y-2">
      {fields.map((f) => (
        <li key={f.id} className="flex items-center justify-between rounded border border-neutral-200 p-2 text-sm">
          <div>
            <div className="font-medium">{f.label}</div>
            <div className="text-neutral-600">{f.value}</div>
          </div>
          <button
            onClick={() => remove(f.id)}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
