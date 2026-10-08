"use client";

import Link from "next/link";
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
      <h2 className="mb-2 font-bold text-heading">Application assistant</h2>
      <p className="mb-3 text-sm text-foreground-muted">
        Tailoring sends your stored résumé and job context to Anthropic, then opens the employer form and fills supported
        fields from saved answers. The website can access attached files and filled values before you click Submit.{" "}
        <Link href="/privacy#external-services" className="link-accent">Provider and employer data use</Link>.
      </p>
      <p className="mb-3 text-sm font-medium text-foreground">
        The assistant never clicks Submit or reports an application as sent without an employer confirmation or your explicit attestation.
      </p>

      {!hasResumeTemplate && (
        <div className="mb-3 rounded-xl border border-accent/40 bg-accent/10 p-2 text-base text-accent-light">
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
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary ">
          {uploading ? "Uploading..." : hasResumeTemplate ? "Replace resume" : "Upload resume"}
        </button>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!hasResumeTemplate || applying}
          className="btn-primary "
        >
          {applying ? "Working..." : "Tailor & fill form"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Start application assistance?"
        description={`This sends your stored résumé and job context to Anthropic, opens a real browser for ${role} at ${company}, and attaches/fills your data. The website may process it before Submit. You review the form; automation will not click Submit.`}
        confirmLabel="Start"
        busy={applying}
        onConfirm={startApply}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={attestationOpen}
        title="Confirm your submission?"
        description="Only choose this if you personally submitted the application in the browser. This updates the tracker and can queue configured Hunter contact research and AI drafting, as well as follow-up reminders."
        confirmLabel="I submitted it"
        busy={applying}
        onConfirm={attestSubmission}
        onCancel={() => setAttestationOpen(false)}
      />

      {error && <p role="alert" className="mb-3 text-base text-danger-dark">{error}</p>}

      {latestRun && (
        <div className="rounded-xl border border-border-soft p-3 text-base">
          <div className="mb-1 font-semibold text-foreground">Latest run: {latestRun.status}</div>

          {latestRun.status === "needs_input" && (
            <div className="mt-2">
              <label className="mb-1 block text-sm text-foreground-muted">{latestRun.missingFieldLabel}</label>
              <div className="flex gap-2">
                <input
                  value={missingValue}
                  onChange={(e) => setMissingValue(e.target.value)}
                  className="input-soft flex-1 px-2 py-1"
                />
                <button onClick={submitMissingFieldAndRetry} disabled={applying} className="btn-primary px-3 py-1 text-base">
                  Save &amp; continue
                </button>
              </div>
              <p className="mt-1 text-sm text-foreground-muted">Saved for this and every future application.</p>
            </div>
          )}

          {latestRun.status === "failed" && latestRun.error && <p className="text-danger-dark">{latestRun.error}</p>}

          {latestRun.status === "blocked" && latestRun.error && <p className="text-accent-light">{latestRun.error}</p>}

          {(latestRun.status === "review_required" || latestRun.status === "unknown") && (
            <div className="mt-2">
              <p className="mb-2 text-foreground-muted">
                {latestRun.status === "review_required"
                  ? "Review the browser window. If you submitted it, confirm that action here."
                  : "The site did not provide a reliable submission result. Confirm only if you submitted it."}
              </p>
              <button onClick={() => setAttestationOpen(true)} disabled={applying} className="btn-primary ">
                Confirm I submitted it
              </button>
            </div>
          )}

          {latestRun.status === "submitted" && (
            <p className="text-foreground-muted">
              Confirmed submitted {latestRun.submittedAt?.toLocaleString()} -{" "}
              <a href={`/api/applications/${applicationId}/resume`} className="link-accent">
                download the resume that was used
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
