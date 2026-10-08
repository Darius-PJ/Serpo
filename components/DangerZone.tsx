"use client";

import Link from "next/link";
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
        setCleanupWarning("Your database records were deleted, but some résumé or lead-report files could not be removed. A repeat wipe may not find those files after their records are gone. Stop Serpo and review remaining artifacts manually; see Privacy for deletion limits.");
      }
      router.refresh();
    } catch (cause) {
      const detail = errorMessage(cause, "Please try again.");
      const detailSuffix = detail === "Failed to fetch" ? "" : ` Details: ${detail}`;
      setCleanupWarning(`The wipe could not be confirmed. Some data may already have been deleted. Check that Serpo is running before retrying.${detailSuffix}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-danger/30 bg-surface/90 p-4 shadow-sm shadow-danger/5">
      <h2 className="mb-2 font-bold text-danger-dark">Danger zone</h2>
      <p className="mb-3 text-base text-foreground-muted">
        Clears tracked workspace records and attempts to remove generated résumé and lead-report files.
        Backups, API keys, browser state, logs and shared search caches are not removed.{" "}
        <Link href="/privacy#deletion" className="link-accent">Deletion and retention details</Link>.
      </p>
      <button onClick={() => setOpen(true)} className="btn-danger-outline ">
        Wipe all my data
      </button>
      {cleanupWarning && <p role="alert" className="mt-3 text-base text-danger-dark">{cleanupWarning}</p>}

      <ConfirmDialog
        open={open}
        tone="danger"
        title="Wipe tracked workspace records?"
        description="This clears tracked workspace records and attempts to remove generated résumé and lead-report files. It leaves backups, credentials, browser state, logs and shared search caches. Back up anything you want to keep first."
        confirmLabel="Yes, wipe tracked data"
        busy={busy}
        onConfirm={wipeAll}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
