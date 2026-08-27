import "server-only";
import { rm } from "node:fs/promises";
import path from "node:path";

export const RESUME_ARTIFACT_DIRECTORY = path.resolve(process.cwd(), "data", "resumes");

function isSafeId(value: string): boolean {
  return /^[a-z0-9]+$/i.test(value);
}

export function resumeArtifactPath(applicationId: string, applyRunId: string): string {
  if (!isSafeId(applicationId) || !isSafeId(applyRunId)) {
    throw new Error("invalid resume artifact identifier");
  }
  return path.join(RESUME_ARTIFACT_DIRECTORY, applicationId, `${applyRunId}.docx`);
}

export function legacyResumeArtifactPath(applicationId: string): string {
  if (!isSafeId(applicationId)) throw new Error("invalid resume artifact identifier");
  return path.join(RESUME_ARTIFACT_DIRECTORY, `${applicationId}.docx`);
}

export function isStoredResumeArtifactPath(value: string): boolean {
  const resolved = path.resolve(value);
  return resolved.startsWith(`${RESUME_ARTIFACT_DIRECTORY}${path.sep}`) && path.extname(resolved).toLowerCase() === ".docx";
}

export async function removeResumeArtifacts(paths: string[]): Promise<{ removed: number; failures: string[] }> {
  const uniquePaths = [...new Set(paths.filter(isStoredResumeArtifactPath))];
  const failures: string[] = [];
  let removed = 0;
  for (const filePath of uniquePaths) {
    try {
      await rm(filePath, { force: true });
      removed++;
    } catch {
      failures.push(filePath);
    }
  }
  return { removed, failures };
}
