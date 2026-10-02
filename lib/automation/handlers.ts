import "server-only";
import { runStaleCheck } from "@/lib/scheduler/staleCheck";
import { draftDueFollowUps } from "@/lib/outreach/followUpDrafts";
import { prepareOutreach } from "@/lib/outreach/autoPrepare";
import { runSavedSearch } from "@/lib/savedSearches/savedSearches";
import { PermanentJobError, isRetryableError } from "./errors";
import { parseJobPayload, type AutomationJobKind } from "./jobs";
import { getAutomationPreferences } from "./settings";
import type { JobHandler } from "./runner";

function payloadId(payload: string, field: string): string {
  const value = parseJobPayload(payload)[field];
  if (typeof value !== "string") throw new PermanentJobError(`job payload has no ${field}`);
  return value;
}

/**
 * Each kind calls the existing domain code. Automation may search, flag,
 * draft, and remind; none of these tracks a job, applies, or sends anything.
 */
export const JOB_HANDLERS: Record<AutomationJobKind, JobHandler> = {
  "saved_search.run": async (job) => {
    const preferences = await getAutomationPreferences(job.userId);
    // Switched off after this run was queued.
    if (!preferences.enabled) return;
    const outcome = await runSavedSearch(job.userId, payloadId(job.payload, "savedSearchId"), {
      unattended: { jobSpyConsent: preferences.jobSpyConsent },
    });
    // Every source failing usually means the network was down: worth a retry.
    if (outcome?.allSourcesFailed) throw new Error(`Every source failed: ${outcome.failedSources.join(", ")}`);
  },

  "stale.scan": async (job) => {
    await runStaleCheck(job.userId);
  },

  "followup.scan": async (job) => {
    try {
      await draftDueFollowUps(job.userId);
    } catch (err) {
      if (isRetryableError(err)) throw err;
      throw new PermanentJobError(err instanceof Error ? err.message : String(err));
    }
  },

  "outreach.prepare": async (job, { finalAttempt }) => {
    await prepareOutreach(job.userId, payloadId(job.payload, "applicationId"), { finalAttempt });
  },
};
