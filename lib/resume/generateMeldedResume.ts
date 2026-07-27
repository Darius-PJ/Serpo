import "server-only";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";
import type { BenchmarkResume } from "./benchmarkResumeSchema";
import type { ImprovedResume } from "./improvedResumeSchema";
import { MELDED_RESUME_SCHEMA, MeldedResumeZ, InvalidMeldedResumeError, type MeldedResume } from "./meldedResumeSchema";

const SYSTEM_PROMPT =
  "You help a job seeker see where they could grow to match their competition. You are given two " +
  "resumes for the same target job: an ILLUSTRATIVE, fully-fictional \"competitive benchmark\" " +
  "resume, and the job seeker's own real (improved) resume. Produce ONE hybrid resume representing " +
  "an aspirational growth target — what the job seeker's profile could plausibly look like if they " +
  "closed the gap with the competition. This is explicitly NOT a factual claim about the job " +
  "seeker today, and is never submitted anywhere automatically. Follow these rules strictly:\n" +
  "- Use the job seeker's REAL contact header (from their improved resume), never the fictional " +
  "one — this document is about their own growth.\n" +
  "- Keep the job seeker's genuinely-held experience and education entries intact as the " +
  "foundation.\n" +
  "- Where it meaningfully closes the gap, add or elevate entries, bullets, or skills inspired by " +
  "the benchmark — represent these as a realistic next step (e.g. a skill to learn, a scope of " +
  "responsibility to grow into), not as something the job seeker already has.\n" +
  "- Do not simply copy the fictional benchmark's fabricated employers into this resume as if they " +
  "were the job seeker's own history.";

function buildUserPrompt(benchmark: BenchmarkResume, improved: ImprovedResume, company: string, role: string): string {
  return (
    `TARGET JOB — ROLE: ${role}\nCOMPANY: ${company}\n\n` +
    `COMPETITIVE BENCHMARK RESUME (fictional):\n${JSON.stringify(benchmark)}\n\n` +
    `JOB SEEKER'S OWN (IMPROVED) RESUME (real):\n${JSON.stringify(improved)}`
  );
}

/**
 * Blends the benchmark and improved resumes into one aspirational "growth
 * target" hybrid resume. Never used for a real application — illustrative
 * only, like generateBenchmarkResume.ts and generateImprovedResume.ts.
 */
export async function generateMeldedResume(
  benchmark: BenchmarkResume,
  improved: ImprovedResume,
  company: string,
  role: string
): Promise<MeldedResume> {
  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: MELDED_RESUME_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(benchmark, improved, company, role) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error("Claude did not return structured resume content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidMeldedResumeError("response was not valid JSON");
  }

  const result = MeldedResumeZ.safeParse(parsed);
  if (!result.success) {
    throw new InvalidMeldedResumeError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}
