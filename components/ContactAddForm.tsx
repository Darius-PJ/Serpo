"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Manual contact entry — merges into an existing same-name contact at the same company. */
export function ContactAddForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !company.trim()) return;
    setError(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, company, title: title || undefined, email: email || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "The contact could not be saved.");
      return;
    }
    setName("");
    setCompany("");
    setTitle("");
    setEmail("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={onSubmit} className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          aria-label="Contact name"
          className="input-soft px-2.5 py-1.5 text-sm"
        />
        <input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          placeholder="Company"
          aria-label="Contact company"
          className="input-soft px-2.5 py-1.5 text-sm"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title (optional)"
          aria-label="Contact title"
          className="input-soft px-2.5 py-1.5 text-sm"
        />
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email (optional)"
          aria-label="Contact email"
          className="input-soft px-2.5 py-1.5 text-sm"
        />
        <button type="submit" disabled={isPending} className="btn-primary px-3 py-1.5 text-sm">
          Add contact
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger-dark">{error}</p>}
    </form>
  );
}
