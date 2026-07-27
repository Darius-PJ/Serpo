export type ResumeArtifact = "benchmark" | "improved" | "melded";

export function isResumeArtifact(value: unknown): value is ResumeArtifact {
  return value === "benchmark" || value === "improved" || value === "melded";
}
