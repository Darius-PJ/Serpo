"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Message } from "@/generated/prisma";

export function MessagePanel({ applicationId, messages }: { applicationId: string; messages: Message[] }) {
  const router = useRouter();
  const [generating, setGenerating] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function generate(type: "IMMEDIATE" | "FOLLOW_UP") {
    setGenerating(type);
    try {
      await fetch(`/api/applications/${applicationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      router.refresh();
    } finally {
      setGenerating(null);
    }
  }

  async function approve(message: Message) {
    await fetch(`/api/messages/${message.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftText: drafts[message.id] ?? message.draftText }),
    });
    router.refresh();
  }

  async function markSent(message: Message) {
    await fetch(`/api/messages/${message.id}/sent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    router.refresh();
  }

  return (
    <section className="mb-6 rounded border border-neutral-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Messages</h2>
        <div className="flex gap-2">
          <button
            onClick={() => generate("IMMEDIATE")}
            disabled={generating !== null}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50"
          >
            {generating === "IMMEDIATE" ? "Generating…" : "Generate immediate draft"}
          </button>
          <button
            onClick={() => generate("FOLLOW_UP")}
            disabled={generating !== null}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50"
          >
            {generating === "FOLLOW_UP" ? "Generating…" : "Generate follow-up draft"}
          </button>
        </div>
      </div>

      {messages.length === 0 && <p className="text-sm text-neutral-500">No drafts yet.</p>}

      <ul className="space-y-4">
        {messages.map((message) => (
          <li key={message.id} className="rounded border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
              <span>
                {message.type} — {message.status}
              </span>
              <span>{message.createdAt.toLocaleString()}</span>
            </div>
            <textarea
              defaultValue={message.draftText}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [message.id]: e.target.value }))}
              disabled={message.status === "SENT"}
              rows={5}
              className="w-full rounded border border-neutral-300 p-2 text-sm disabled:bg-neutral-50"
            />
            <div className="mt-2 flex gap-2 text-xs">
              {message.status === "DRAFT" && (
                <button
                  onClick={() => approve(message)}
                  className="rounded bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
                >
                  Approve
                </button>
              )}
              {message.status === "APPROVED" && (
                <>
                  <button
                    onClick={() => navigator.clipboard.writeText(drafts[message.id] ?? message.draftText)}
                    className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
                  >
                    Copy
                  </button>
                  <a
                    href={`mailto:?body=${encodeURIComponent(drafts[message.id] ?? message.draftText)}`}
                    className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
                  >
                    Open in email
                  </a>
                  <button
                    onClick={() => markSent(message)}
                    className="rounded bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
                  >
                    Mark sent
                  </button>
                </>
              )}
              {message.status === "SENT" && (
                <span className="text-neutral-500">Sent {message.sentAt?.toLocaleString()}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
