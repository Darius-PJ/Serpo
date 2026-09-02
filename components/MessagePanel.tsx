"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Message } from "@/generated/prisma";
import { ConfirmDialog } from "./ConfirmDialog";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

type MessageType = "IMMEDIATE" | "FOLLOW_UP";

export function MessagePanel({
  applicationId,
  messages,
  submissionConfirmed,
  followUpDue,
}: {
  applicationId: string;
  messages: Message[];
  submissionConfirmed: boolean;
  followUpDue: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState<MessageType | null>(null);
  const [requestedType, setRequestedType] = useState<MessageType | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!requestedType) return;
    setGenerating(requestedType);
    setError(null);
    try {
      await requestJson(`/api/applications/${applicationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: requestedType }),
      });
      setRequestedType(null);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The outreach draft could not be generated."));
    } finally {
      setGenerating(null);
    }
  }

  async function approve(message: Message) {
    setError(null);
    try {
      await requestJson(`/api/messages/${message.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftText: drafts[message.id] ?? message.draftText }),
      });
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The draft could not be approved."));
    }
  }

  async function markSent(message: Message) {
    setError(null);
    try {
      await requestJson(`/api/messages/${message.id}/sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The message could not be marked sent."));
    }
  }

  const requestedLabel = requestedType === "FOLLOW_UP" ? "follow-up" : "immediate";

  return (
    <section className="card-soft mb-6 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-bold text-foreground">Outreach drafts</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setRequestedType("IMMEDIATE")}
            disabled={!submissionConfirmed || generating !== null}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Generate immediate draft
          </button>
          <button
            onClick={() => setRequestedType("FOLLOW_UP")}
            disabled={!followUpDue || generating !== null}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Generate follow-up draft
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-foreground-muted">
        Draft generation is optional. It sends the application and saved contact context to the configured AI provider, creates a local draft, and never sends an email or message.
      </p>
      {!submissionConfirmed && <p className="mb-3 text-xs text-amber-800">Confirm the application submission before generating outreach.</p>}
      {submissionConfirmed && !followUpDue && <p className="mb-3 text-xs text-foreground-muted">Follow-up drafts become available seven days after confirmed submission.</p>}
      {error && <p role="alert" className="mb-3 text-xs text-danger-dark">{error}</p>}

      {messages.length === 0 && <p className="text-sm text-foreground-muted">No drafts yet.</p>}

      <ul className="space-y-4">
        {messages.map((message) => (
          <li key={message.id} className="rounded-xl border border-border-soft p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-foreground-muted">
              <span>{message.type} - {message.status}</span>
              <span>{message.createdAt.toLocaleString()}</span>
            </div>
            <textarea
              defaultValue={message.draftText}
              onChange={(event) => setDrafts((previous) => ({ ...previous, [message.id]: event.target.value }))}
              disabled={message.status === "SENT"}
              rows={5}
              className="input-soft w-full p-2 text-sm disabled:opacity-60"
            />
            <div className="mt-2 flex gap-2 text-xs">
              {message.status === "DRAFT" && (
                <button onClick={() => approve(message)} className="btn-primary px-3 py-1.5">Approve</button>
              )}
              {message.status === "APPROVED" && (
                <>
                  <button
                    onClick={() => navigator.clipboard.writeText(drafts[message.id] ?? message.draftText)}
                    className="btn-secondary px-3 py-1.5"
                  >
                    Copy
                  </button>
                  <a
                    href={`mailto:?body=${encodeURIComponent(drafts[message.id] ?? message.draftText)}`}
                    className="btn-secondary px-3 py-1.5"
                  >
                    Open in email
                  </a>
                  <button onClick={() => markSent(message)} className="btn-primary px-3 py-1.5">Mark sent</button>
                </>
              )}
              {message.status === "SENT" && <span className="text-foreground-muted">Sent {message.sentAt?.toLocaleString()}</span>}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={requestedType !== null}
        title={`Generate ${requestedLabel} draft?`}
        description="This sends the application and saved decision-maker context to the configured AI provider to create a local editable draft. It will not contact anyone or mark a message sent."
        confirmLabel="Generate draft"
        busy={generating !== null}
        onConfirm={generate}
        onCancel={() => setRequestedType(null)}
      />
    </section>
  );
}
