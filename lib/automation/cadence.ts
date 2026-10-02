// Saved-search cadences. Safe to import in both client forms and server code.
// Every slot is aligned to local midnight in the user's timezone
// (lib/automation/slots.ts): "daily" is once per local calendar day.
export const CADENCES = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "every_12h", label: "Every 12 hours" },
  { value: "every_6h", label: "Every 6 hours" },
] as const;

export type Cadence = (typeof CADENCES)[number]["value"];

export function isCadence(value: unknown): value is Cadence {
  return CADENCES.some((cadence) => cadence.value === value);
}

/**
 * The cadences a search that includes a JobSpy board may use. Unattended
 * scraping is the largest terms-of-service and blocking risk, so those
 * searches run at most once a day. Six hours is the floor for everything else,
 * which bounds API quota use.
 */
export const JOBSPY_CADENCES: readonly Cadence[] = ["daily", "weekdays"];
