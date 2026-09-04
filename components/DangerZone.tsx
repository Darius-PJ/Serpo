"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cleanupWarning, setCleanupWarning] = useState<string | null>(null);

  async function wipeAll() {
    setBusy(true);
    setCleanupWarning(null);
    try {
      const data = await requestJson<{ result?: { artifactCleanupFailures?: number; archiveCleanupFailures?: number } }>("/api/privacy/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wipe-all", confirm: "WIPE" }),
      });
      setOpen(false);
      const failures = Number(data.result?.artifactCleanupFailures ?? 0) + Number(data.result?.archiveCleanupFailures ?? 0);
      if (failures > 0) {
        setCleanupWarning("Your database records were deleted, but some local files could not be removed. Close the app and retry the wipe to finish cleanup.");
      }
      router.refresh();
    } catch (cause) {
      const detail = errorMessage(cause, "Please try again.");
      const detailSuffix = detail === "Failed to fetch" ? "" : ` Details: ${detail}`;
      setCleanupWarning(`The workspace data could not be deleted. Check your connection and try again.${detailSuffix}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-danger/30 bg-surface/90 p-4 shadow-sm shadow-danger/5">
      <h2 className="mb-2 font-bold text-danger-dark">Danger zone</h2>
      <p className="mb-3 text-base text-foreground-muted">
        Permanently deletes every application, contact, task, résumé, saved answer, and private
        sourcing resource in this local workspace. The shared job board directory is preserved.
      </p>
      <button onClick={() => setOpen(true)} className="btn-danger-outline ">
        Wipe all my data
      </button>
      {cleanupWarning && <p role="alert" className="mt-3 text-base text-danger-dark">{cleanupWarning}</p>}

      <ConfirmDialog
        open={open}
        tone="danger"
        title="Wipe all workspace data?"
        description="This deletes every application, contact, interaction, task, message draft, résumé, saved answer, audit event, and private sourcing resource. This cannot be undone."
        confirmLabel="Yes, wipe everything"
        busy={busy}
        onConfirm={wipeAll}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
