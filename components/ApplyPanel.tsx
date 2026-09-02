"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ApplyRun } from "@/generated/prisma";
import { ConfirmDialog } from "./ConfirmDialog";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

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
  const [attestationOpen, setAttestationOpen] = useState(false);
  const [missingValue, setMissingValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const latestRun = runs[0];

  async function uploadResume(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await requestJson("/api/resume-template", { method: "POST", body: formData });
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "The resume template could not be uploaded."));
    } finally {
      setUploading(false);
    }
  }

  async function startApply() {
    setApplying(true);
    setError(null);
    try {
      await requestJson(`/api/applications/${applicationId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "APPLY", idempotencyKey: crypto.randomUUID() }),
      });
      setConfirmOpen(false);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Application assistance could not start."));
    } finally {
      setApplying(false);
    }
  }

  async function attestSubmission() {
    if (!latestRun) return;
    setApplying(true);
    setError(null);
    try {
      await requestJson(`/api/applications/${applicationId}/apply/${latestRun.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "SUBMITTED" }),
      });
      setAttestationOpen(false);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not confirm the submission."));
    } finally {
      setApplying(false);
    }
  }

  async function submitMissingFieldAndRetry() {
    if (!latestRun?.missingFieldKey || !missingValue.trim()) return;
    setError(null);
    try {
      await requestJson("/api/profile-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: latestRun.missingFieldKey, label: latestRun.missingFieldLabel, value: missingValue }),
      });
      setMissingValue("");
      // This resumes an already-confirmed workflow action; it still will not submit the site form.
      await startApply();
    } catch (cause) {
      setError(errorMessage(cause, "The missing answer could not be saved."));
    }
  }

  return (
    <section className="card-soft mb-6 p-4">
      <h2 className="mb-2 font-bold text-foreground">Application assistant</h2>
      <p className="mb-3 text-xs text-foreground-muted">
        Tailor a resume for this posting, open a visible browser, and fill supported fields from your saved profile.
        You review every form and choose whether to submit it.
      </p>
      <p className="mb-3 text-xs font-medium text-foreground">
        The assistant never clicks Submit or reports an application as sent without an employer confirmation or your explicit attestation.
      </p>

      {!hasResumeTemplate && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Upload a resume template (.md or .docx) before you can use the application assistant.
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
          {uploading ? "Uploading..." : hasResumeTemplate ? "Replace resume" : "Upload resume"}
        </button>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!hasResumeTemplate || applying}
          className="btn-primary px-3 py-1.5 text-sm"
        >
          {applying ? "Working..." : "Tailor & fill form"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Start application assistance?"
        description={`This opens a real browser, tailors your resume, and fills out the application for ${role} at ${company}. You review it and decide whether to submit; automation will not click Submit.`}
        confirmLabel="Start"
        busy={applying}
        onConfirm={startApply}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={attestationOpen}
        title="Confirm your submission?"
        description="Only choose this if you personally submitted the application in the browser. This updates the tracker and enables follow-up reminders."
        confirmLabel="I submitted it"
        busy={applying}
        onConfirm={attestSubmission}
        onCancel={() => setAttestationOpen(false)}
      />

      {error && <p role="alert" className="mb-3 text-sm text-danger-dark">{error}</p>}

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

          {latestRun.status === "failed" && latestRun.error && <p className="text-danger-dark">{latestRun.error}</p>}

          {latestRun.status === "blocked" && latestRun.error && <p className="text-amber-800">{latestRun.error}</p>}

          {(latestRun.status === "review_required" || latestRun.status === "unknown") && (
            <div className="mt-2">
              <p className="mb-2 text-foreground-muted">
                {latestRun.status === "review_required"
                  ? "Review the browser window. If you submitted it, confirm that action here."
                  : "The site did not provide a reliable submission result. Confirm only if you submitted it."}
              </p>
              <button onClick={() => setAttestationOpen(true)} disabled={applying} className="btn-primary px-3 py-1.5 text-sm">
                Confirm I submitted it
              </button>
            </div>
          )}

          {latestRun.status === "submitted" && (
            <p className="text-foreground-muted">
              Confirmed submitted {latestRun.submittedAt?.toLocaleString()} -{" "}
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
