import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESUME_ARTIFACT_DIRECTORY, isStoredResumeArtifactPath, legacyResumeArtifactPath, resumeArtifactPath } from "@/lib/apply/resumeArtifacts";

describe("resume artifacts", () => {
  it("uses an immutable apply-run-specific location", () => {
    const artifact = resumeArtifactPath("app123", "run456");
    expect(artifact).toBe(path.join(RESUME_ARTIFACT_DIRECTORY, "app123", "run456.docx"));
    expect(isStoredResumeArtifactPath(artifact)).toBe(true);
  });

  it("recognizes the legacy application-level location for privacy cleanup", () => {
    expect(isStoredResumeArtifactPath(legacyResumeArtifactPath("app123"))).toBe(true);
  });

  it("does not permit paths outside the resume artifact directory", () => {
    expect(isStoredResumeArtifactPath(path.resolve(process.cwd(), "data", "app.db"))).toBe(false);
  });
});
