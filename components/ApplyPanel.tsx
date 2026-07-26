"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ApplyRun } from "@/generated/prisma";
import { ConfirmDialog } from "./ConfirmDialog";

export function ApplyPanel({
  applicationId,
  company,
  role,
  hasResumeTemplate,
  runs,
}: {
  applicationId: string;
  company: string;
  role: string;
  hasResumeTemplate: boolean;
  runs: ApplyRun[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [missingValue, setMissingValue] = useState("");

  const latestRun = runs[0];

  async function uploadResume(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch("/api/resume-template", { method: "POST", body: formData });
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function startApply() {
    setApplying(true);
    try {
      await fetch(`/api/applications/${applicationId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "APPLY" }),
      });
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  async function submitMissingFieldAndRetry() {
    if (!latestRun?.missingFieldKey || !missingValue.trim()) return;
    await fetch("/api/profile-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: latestRun.missingFieldKey, label: latestRun.missingFieldLabel, value: missingValue }),
    });
    setMissingValue("");
    // Continuation of an already-confirmed submission, not a new one — no re-prompt.
    await startApply();
  }

  return (
    <section className="mb-6 rounded border border-neutral-200 p-4">
      <h2 className="mb-2 font-semibold">Auto-apply</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Tailors your resume to this posting, then opens a visible browser window and fills the
        application. It pauses for your review right before the final submit click — nothing is
        sent until you resume it in that window.
      </p>

      {!hasResumeTemplate && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Upload a resume template (.md or .docx) before you can auto-apply.
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.docx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : hasResumeTemplate ? "Replace resume" : "Upload resume"}
        </button>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!hasResumeTemplate || applying}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {applying ? "Running…" : "Tailor & Apply"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Start auto-apply?"
        description={`This opens a real browser, tailors your resume, and fills out the application for ${role} at ${company}. You'll get a chance to review the filled form before it's actually submitted.`}
        confirmLabel="Start"
        busy={applying}
        onConfirm={startApply}
        onCancel={() => setConfirmOpen(false)}
      />

      {latestRun && (
        <div className="rounded border border-neutral-200 p-3 text-sm">
          <div className="mb-1 font-medium">Latest run: {latestRun.status}</div>

          {latestRun.status === "needs_input" && (
            <div className="mt-2">
              <label className="mb-1 block text-xs text-neutral-600">{latestRun.missingFieldLabel}</label>
              <div className="flex gap-2">
                <input
                  value={missingValue}
                  onChange={(e) => setMissingValue(e.target.value)}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1"
                />
                <button
                  onClick={submitMissingFieldAndRetry}
                  disabled={applying}
                  className="rounded bg-neutral-900 px-3 py-1 text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  Save &amp; continue
                </button>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Saved for this and every future application.</p>
            </div>
          )}

          {latestRun.status === "failed" && latestRun.error && (
            <p className="text-red-600">{latestRun.error}</p>
          )}

          {latestRun.status === "submitted" && (
            <p className="text-neutral-600">
              Submitted {latestRun.submittedAt?.toLocaleString()} —{" "}
              <a href={`/api/applications/${applicationId}/resume`} className="underline">
                download the resume that was used
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
