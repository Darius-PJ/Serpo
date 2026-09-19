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
