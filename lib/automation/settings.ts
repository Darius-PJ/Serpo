import "server-only";
import type { AutomationSettings } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { parseStoredJobSpySites, type JobSpySite } from "@/lib/jobSpyBoards";
import { isValidTimeZone, systemTimeZone } from "./slots";

export interface AutomationPreferences {
  /** Master switch for unattended saved-search runs. */
  enabled: boolean;
  /** The chosen IANA zone; null follows this computer's zone. */
  timezone: string | null;
  /** The zone slot math actually uses. */
  effectiveTimezone: string;
  /** JobSpy boards unattended runs may scrape. */
  jobSpyConsent: JobSpySite[];
}

// Mirrors the AutomationSettings column defaults, for accounts with no row yet.
const DEFAULT_JOBSPY_CONSENT: JobSpySite[] = ["indeed", "linkedin", "zip_recruiter", "glassdoor"];

export function automationPreferencesFrom(row: AutomationSettings | null): AutomationPreferences {
  // A zone this runtime no longer recognizes falls back to the system zone rather than breaking the scheduler.
  const timezone = row?.timezone && isValidTimeZone(row.timezone) ? row.timezone : null;
  return {
    enabled: row?.enabled ?? false,
    timezone,
    effectiveTimezone: timezone ?? systemTimeZone(),
    jobSpyConsent: row ? parseStoredJobSpySites(row.jobSpyConsent) : DEFAULT_JOBSPY_CONSENT,
  };
}

export async function getAutomationPreferences(userId: string): Promise<AutomationPreferences> {
  return automationPreferencesFrom(await prisma.automationSettings.findUnique({ where: { userId } }));
}

export interface AutomationPreferencesPatch {
  enabled?: boolean;
  /** Must already be validated with isValidTimeZone; null follows the system zone. */
  timezone?: string | null;
  jobSpyConsent?: JobSpySite[];
}

export async function updateAutomationPreferences(userId: string, patch: AutomationPreferencesPatch): Promise<AutomationPreferences> {
  const data = {
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
    ...(patch.jobSpyConsent !== undefined ? { jobSpyConsent: JSON.stringify(patch.jobSpyConsent) } : {}),
  };
  const row = await prisma.automationSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return automationPreferencesFrom(row);
}
