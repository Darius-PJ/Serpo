"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Contact } from "@/generated/prisma";
import { ConfirmDialog } from "./ConfirmDialog";
import { InteractionLogForm } from "./InteractionLogForm";
import { guessDomainFromCompany } from "@/lib/osint/guessDomain";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export interface ContactLinkView {
  id: string;
  sourceTool: string;
  confidence: string | null;
  foundAt: Date;
  contact: Contact;
}

export function ContactPanel({
  applicationId,
  company,
  links,
  availableContacts,
}: {
  applicationId: string;
  company: string;
  links: ContactLinkView[];
  availableContacts: Contact[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchNotice, setResearchNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [domain, setDomain] = useState(() => guessDomainFromCompany(company));
  const unlinkedContacts = availableContacts.filter((contact) => !links.some((link) => link.contact.id === contact.id));
  const [contactId, setContactId] = useState(unlinkedContacts[0]?.id ?? "");

  async function attachContact(event: React.FormEvent) {
    event.preventDefault();
    if (!contactId) return;
    setLoading(true);
    setError(null);
    try {
      await requestJson(`/api/applications/${applicationId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      setResearchNotice("Contact attached to this application.");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The contact could not be attached."));
    } finally {
      setLoading(false);
    }
  }

  async function research() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    setResearchNotice(null);
    try {
      const data = await requestJson<{
        runs?: { error?: string }[];
        created?: unknown[];
        duplicatesSkipped?: number;
        limitReached?: boolean;
      }>(`/api/applications/${applicationId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const toolError = data.runs?.find((run: { error?: string }) => run.error)?.error;
      if (toolError) setError(toolError);
      setResearchNotice(
        data.limitReached
          ? `Saved ${data.created?.length ?? 0} contacts; the 50-contact safety limit was reached.`
          : `Saved ${data.created?.length ?? 0} new contacts. ${data.duplicatesSkipped ?? 0} duplicates were skipped.`
      );
      setConfirmOpen(false);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Contact research could not be completed."));
    } finally {
      setLoading(false);
    }
  }

  async function purgeResearch() {
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<{ result?: { count?: number } }>("/api/privacy/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge-contact-research", applicationId }),
      });
      setPurgeOpen(false);
      setResearchNotice(`Removed ${data.result?.count ?? 0} saved research links.`);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Saved research could not be deleted."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-soft mb-6 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-bold text-foreground">Contacts</h2>
        <div className="flex gap-2">
          {links.length > 0 && (
            <button onClick={() => setPurgeOpen(true)} disabled={loading} className="btn-secondary px-3 py-1.5 text-xs">
              Delete research
            </button>
          )}
          <button onClick={() => setConfirmOpen(true)} disabled={loading} className="btn-primary px-3 py-1.5 text-xs">
            {loading ? "Researching..." : "Research contacts"}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-foreground-muted">
        Research may send the domain you approve to configured public-source tools. Discovered people are saved as
        contacts linked to this application. No message is sent automatically.
      </p>
      {error && <p role="alert" className="mb-2 text-xs text-danger-dark">{error}</p>}
      {researchNotice && <p className="mb-2 text-xs text-foreground-muted">{researchNotice}</p>}

      {unlinkedContacts.length > 0 && (
        <form onSubmit={attachContact} className="mb-3 flex flex-wrap gap-2">
          <select
            aria-label="Attach existing contact"
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            className="input-soft px-2.5 py-1.5 text-sm"
          >
            {unlinkedContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name ?? contact.email ?? "Unnamed contact"} — {contact.company}
              </option>
            ))}
          </select>
          <button type="submit" disabled={loading} className="btn-secondary px-3 py-1.5 text-xs">Attach contact</button>
        </form>
      )}

      {links.length === 0 ? (
        <p className="text-sm text-foreground-muted">No linked contacts yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {links.map((link) => (
            <li key={link.id} className="rounded-lg border border-border-soft p-2">
              <div className="font-medium text-foreground">{link.contact.name ?? "Name not provided"}</div>
              {link.contact.title && <div className="text-foreground-muted">{link.contact.title}</div>}
              {link.contact.email && <div className="break-all text-foreground-muted">{link.contact.email}</div>}
              <div className="mt-1 text-xs text-foreground-muted">
                Source: {link.sourceTool}{link.confidence ? ` (${link.confidence})` : ""}
              </div>
              <InteractionLogForm contactId={link.contact.id} applicationId={applicationId} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs">
        <Link href="/contacts" className="text-primary-dark underline">
          All contacts →
        </Link>
      </p>

      <ConfirmDialog
        open={confirmOpen}
        title="Research this domain?"
        description="The domain below will be sent to configured public-source research tools. Check it carefully: it was guessed from the company name. The app stores returned contacts locally and will not message anyone."
        confirmLabel="Research"
        busy={loading}
        onConfirm={research}
        onCancel={() => setConfirmOpen(false)}
      >
        <label className="mb-1 block text-xs text-foreground-muted">Domain</label>
        <input
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="example.com"
          className="input-soft w-full px-2.5 py-1.5 text-sm"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={purgeOpen}
        tone="danger"
        title="Delete saved contact research?"
        description="This removes this application's research links, and deletes discovered contacts that have no other links, logged interactions, or drafts. It does not change the application or its message drafts."
        confirmLabel="Delete research"
        busy={loading}
        onConfirm={purgeResearch}
        onCancel={() => setPurgeOpen(false)}
      />
    </section>
  );
}
