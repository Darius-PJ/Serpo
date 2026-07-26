"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function wipeAll() {
    setBusy(true);
    try {
      await fetch("/api/privacy/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wipe-all", confirm: "WIPE" }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-danger/30 bg-surface/90 p-4 shadow-sm shadow-danger/5">
      <h2 className="mb-2 font-bold text-danger-dark">Danger zone</h2>
      <p className="mb-3 text-sm text-foreground-muted">
        Permanently deletes every application, your résumé template, and all saved answers on
        this account. Your login itself is not deleted — you can start fresh afterward. Other
        accounts on this machine, and the shared job board directory, are not affected.
      </p>
      <button onClick={() => setOpen(true)} className="btn-danger-outline px-3 py-1.5 text-sm">
        Wipe all my data
      </button>

      <ConfirmDialog
        open={open}
        tone="danger"
        title="Wipe all data on this account?"
        description="This deletes every application, decision-maker research, message draft, your résumé template, and every saved answer on this account. This cannot be undone."
        confirmLabel="Yes, wipe everything"
        busy={busy}
        onConfirm={wipeAll}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
