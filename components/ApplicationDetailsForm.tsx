"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export function ApplicationDetailsForm({
  applicationId,
  company: initialCompany,
  role: initialRole,
  notes: initialNotes,
  description: initialDescription,
}: {
  applicationId: string;
  company: string;
  role: string;
  notes: string | null;
  description: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [company, setCompany] = useState(initialCompany);
  const [role, setRole] = useState(initialRole);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await requestJson(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, notes, description }),
      });
      setSaved(true);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The application details could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card-soft mb-6 grid gap-3 p-4 sm:grid-cols-2">
      <h2 className="font-bold text-foreground sm:col-span-2">Application record</h2>
      <label className="text-sm font-medium">Company
        <input value={company} onChange={(event) => setCompany(event.target.value)} className="input-soft mt-1 w-full px-3 py-2" />
      </label>
      <label className="text-sm font-medium">Role
        <input value={role} onChange={(event) => setRole(event.target.value)} className="input-soft mt-1 w-full px-3 py-2" />
      </label>
      <label className="text-sm font-medium sm:col-span-2">Application notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="input-soft mt-1 w-full px-3 py-2" />
      </label>
      <label className="text-sm font-medium sm:col-span-2">Captured job description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} className="input-soft mt-1 w-full px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-danger-dark sm:col-span-2">{error}</p>}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={saving} className="btn-primary px-3 py-1.5 text-sm">Save details</button>
        {saved && <span role="status" className="text-xs text-foreground-muted">Saved</span>}
      </div>
    </form>
  );
}
