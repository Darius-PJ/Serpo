// Safe to import in both the search form and the server registry.
export const JOBSPY_BOARDS = [
  { site: "indeed", label: "Indeed" },
  { site: "linkedin", label: "LinkedIn" },
  { site: "zip_recruiter", label: "ZipRecruiter" },
  { site: "glassdoor", label: "Glassdoor" },
  { site: "google", label: "Google Jobs" },
] as const;

export type JobSpySite = typeof JOBSPY_BOARDS[number]["site"];

export function selectedJobSpySites(value: unknown): JobSpySite[] {
  if (!Array.isArray(value)) return JOBSPY_BOARDS.map((board) => board.site);
  return JOBSPY_BOARDS.map((board) => board.site).filter((site) => value.includes(site));
}

/** Reads a JSON site list stored in the database. Anything unreadable means no boards, never all of them. */
export function parseStoredJobSpySites(json: string): JobSpySite[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? selectedJobSpySites(parsed) : [];
  } catch {
    return [];
  }
}
