"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { JOBSPY_BOARDS, type JobSpySite } from "@/lib/jobSpyBoards";
import { errorMessage, requestJson } from "@/lib/http/requestJson";

export function AutomationSettingsForm({
  enabled: initialEnabled,
  timezone: initialTimezone,
  jobSpyConsent: initialConsent,
  systemTimeZone,
  timeZones,
}: {
  enabled: boolean;
  /** Null follows this computer's zone. */
  timezone: string | null;
  jobSpyConsent: JobSpySite[];
  systemTimeZone: string;
  /** Every zone the server's Intl supports, for the select. */
  timeZones: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  // "" stands for "this computer's zone" in the select.
  const [timezone, setTimezone] = useState(initialTimezone ?? "");
  const [consent, setConsent] = useState<JobSpySite[]>(initialConsent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A saved zone this runtime lists under another name still needs its own option.
  const zones = timezone && !timeZones.includes(timezone) ? [timezone, ...timeZones] : timeZones;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await requestJson("/api/automation/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, timezone: timezone || null, jobSpyConsent: consent }),
      });
      setSaved(true);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(errorMessage(cause, "The automation settings could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card-soft space-y-4 p-4">
      <label className="flex items-center gap-2 text-base font-semibold text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setSaved(false);
          }}
          className="accent-primary"
        />
        Run saved searches automatically while Serpo is open
      </label>

      <label className="flex flex-wrap items-center gap-2 text-base text-foreground">
        Time zone
        <select
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
            setSaved(false);
          }}
          className="input-soft max-w-full px-2 py-1 text-base"
        >
          <option value="">This computer ({systemTimeZone})</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-foreground-muted">Schedules count from midnight in this time zone.</p>

      <fieldset>
        <legend className="text-base font-semibold text-foreground">JobSpy boards automatic runs may search</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {JOBSPY_BOARDS.map(({ site, label }) => (
            <label key={site} className="flex items-center gap-2 text-base">
              <input
                type="checkbox"
                checked={consent.includes(site)}
                onChange={(e) => {
                  setConsent((current) => (e.target.checked ? [...current, site] : current.filter((value) => value !== site)));
                  setSaved(false);
                }}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-foreground-muted">
          Automatic runs scrape only the boards checked here; Run now uses every board the search selected. Google Jobs
          is off by default: it already spaces requests 15 minutes apart and pauses after a /sorry/ block.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || isPending} className="btn-primary px-4 py-2 text-base">
          {saving ? "Saving…" : "Save automation settings"}
        </button>
        {saved && !error && <p role="status" className="text-base text-foreground-muted">Saved.</p>}
      </div>
      {error && <p role="alert" className="text-base text-danger-dark">{error}</p>}
    </form>
  );
}
