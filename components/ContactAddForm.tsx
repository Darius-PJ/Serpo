"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

/** Manual contact entry — merges into an existing same-name contact at the same company. */
export function ContactAddForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !company.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await requestJson("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, title: title || undefined, email: email || undefined }),
      });
      setName("");
      setCompany("");
      setTitle("");
      setEmail("");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The contact could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          aria-label="Contact name"
          className="input-soft px-2.5 py-1.5 text-base"
        />
        <input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          placeholder="Company"
          aria-label="Contact company"
          className="input-soft px-2.5 py-1.5 text-base"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title (optional)"
          aria-label="Contact title"
          className="input-soft px-2.5 py-1.5 text-base"
        />
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email (optional)"
          aria-label="Contact email"
          className="input-soft px-2.5 py-1.5 text-base"
        />
        <button type="submit" disabled={saving || isPending} className="btn-primary ">
          Add contact
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger-dark">{error}</p>}
    </form>
  );
}
