import type { ResumeWorkspace } from "@/generated/prisma";
import type { BenchmarkResume } from "./benchmarkResumeSchema";
import type { ImprovedResume } from "./improvedResumeSchema";
import type { MeldedResume } from "./meldedResumeSchema";

export interface SerializedResumeWorkspace extends Omit<ResumeWorkspace, "benchmarkContent" | "improvedContent" | "meldedContent"> {
  benchmarkContent: BenchmarkResume | null;
  improvedContent: ImprovedResume | null;
  meldedContent: MeldedResume | null;
}

function parseOrNull<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Parses the three JSON-serialized content columns so API routes and pages never hand raw JSON strings to the client. */
export function serializeWorkspace(workspace: ResumeWorkspace): SerializedResumeWorkspace {
  return {
    ...workspace,
    benchmarkContent: parseOrNull<BenchmarkResume>(workspace.benchmarkContent),
    improvedContent: parseOrNull<ImprovedResume>(workspace.improvedContent),
    meldedContent: parseOrNull<MeldedResume>(workspace.meldedContent),
  };
}
