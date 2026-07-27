// The three resumes a job-targeted workspace can hold — Meld combines any
// two of these (never a resume with itself).
export type MeldSource = "reference" | "improved" | "benchmark";

export function isMeldSource(value: unknown): value is MeldSource {
  return value === "reference" || value === "improved" || value === "benchmark";
}

export const MELD_SOURCE_LABELS: Record<MeldSource, string> = {
  reference: "Reference resume",
  improved: "Improved resume",
  benchmark: "Competitive benchmark",
};
