"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export function NewApplicationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { application } = await requestJson<{ application: { id: string } }>("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, source: "manual", url: url || undefined, notes: notes || undefined }),
      });
      router.push(`/applications/${application.id}`);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The application could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6">
      <button type="button" onClick={() => setOpen((value) => !value)} className="btn-secondary ">
        Add manual application
      </button>
      {open && (
        <form onSubmit={onSubmit} className="card-soft mt-3 grid gap-3 p-4 sm:grid-cols-2">
          <label className="text-base font-medium text-foreground">
            Company
            <input required value={company} onChange={(event) => setCompany(event.target.value)} className="input-soft mt-1 w-full px-3 py-2" />
          </label>
          <label className="text-base font-medium text-foreground">
            Role
            <input required value={role} onChange={(event) => setRole(event.target.value)} className="input-soft mt-1 w-full px-3 py-2" />
          </label>
          <label className="text-base font-medium text-foreground sm:col-span-2">
            Posting URL <span className="font-normal text-foreground-muted">(optional)</span>
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} className="input-soft mt-1 w-full px-3 py-2" />
          </label>
          <label className="text-base font-medium text-foreground sm:col-span-2">
            Application notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="input-soft mt-1 w-full px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-base text-danger-dark sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className="btn-primary ">Save application</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary ">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
