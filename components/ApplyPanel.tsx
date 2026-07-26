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
    <section className="card-soft mb-6 p-4">
      <h2 className="mb-2 font-bold text-foreground">Auto-apply</h2>
      <p className="mb-3 text-xs text-foreground-muted">
        Tailors your resume to this posting, then opens a visible browser window and fills the
        application. It pauses for your review right before the final submit click — nothing is
        sent until you resume it in that window.
      </p>

      {!hasResumeTemplate && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
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
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary px-3 py-1.5 text-sm">
          {uploading ? "Uploading…" : hasResumeTemplate ? "Replace resume" : "Upload resume"}
        </button>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!hasResumeTemplate || applying}
          className="btn-primary px-3 py-1.5 text-sm"
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
        <div className="rounded-xl border border-border-soft p-3 text-sm">
          <div className="mb-1 font-semibold text-foreground">Latest run: {latestRun.status}</div>

          {latestRun.status === "needs_input" && (
            <div className="mt-2">
              <label className="mb-1 block text-xs text-foreground-muted">{latestRun.missingFieldLabel}</label>
              <div className="flex gap-2">
                <input
                  value={missingValue}
                  onChange={(e) => setMissingValue(e.target.value)}
                  className="input-soft flex-1 px-2 py-1"
                />
                <button onClick={submitMissingFieldAndRetry} disabled={applying} className="btn-primary px-3 py-1 text-sm">
                  Save &amp; continue
                </button>
              </div>
              <p className="mt-1 text-xs text-foreground-muted">Saved for this and every future application.</p>
            </div>
          )}

          {latestRun.status === "failed" && latestRun.error && (
            <p className="text-danger-dark">{latestRun.error}</p>
          )}

          {latestRun.status === "submitted" && (
            <p className="text-foreground-muted">
              Submitted {latestRun.submittedAt?.toLocaleString()} —{" "}
              <a href={`/api/applications/${applicationId}/resume`} className="text-primary-dark underline">
                download the resume that was used
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
