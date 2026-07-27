import "server-only";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";
import type { MeldSource } from "./meldSource";
import { MELDED_RESUME_SCHEMA, MeldedResumeZ, InvalidMeldedResumeError, type MeldedResume } from "./meldedResumeSchema";

export interface MeldSourceInput {
  kind: MeldSource;
  label: string;
  // Plain-text rendering of the resume (lib/resume/exportResume.ts's
  // resumeToPlainText for the structured improved/benchmark resumes, or the
  // raw uploaded text as-is for the reference resume) — keeps the prompt
  // uniform regardless of which two of the three sources were chosen.
  text: string;
}

function buildSystemPrompt(kindA: MeldSource, kindB: MeldSource): string {
  const involvesBenchmark = kindA === "benchmark" || kindB === "benchmark";

  if (involvesBenchmark) {
    return (
      "You help a job seeker see where they could grow to match their competition. You are given " +
      "two resumes for the same target job — exactly one of them is an ILLUSTRATIVE, fully-" +
      "fictional \"competitive benchmark\" resume; the other is real. Produce ONE hybrid resume " +
      "representing an aspirational growth target — what the job seeker's profile could plausibly " +
      "look like if they closed the gap with the competition. This is explicitly NOT a factual " +
      "claim about the job seeker today, and is never submitted anywhere automatically. Follow " +
      "these rules strictly:\n" +
      "- Use the REAL resume's contact header, never the fictional one — this document is about " +
      "the job seeker's own growth.\n" +
      "- Keep the real resume's genuinely-held experience and education entries intact as the " +
      "foundation.\n" +
      "- Where it meaningfully closes the gap, add or elevate entries, bullets, or skills inspired " +
      "by the fictional benchmark — represent these as a realistic next step (e.g. a skill to " +
      "learn, a scope of responsibility to grow into), not as something the job seeker already " +
      "has.\n" +
      "- Do not simply copy the fictional benchmark's fabricated employers into this resume as if " +
      "they were the job seeker's own history."
    );
  }

  return (
    "You help a job seeker reconcile two REAL versions of their own resume for the same target job " +
    "into one best single resume. Neither input is fictional — one is their original uploaded " +
    "resume, the other an elaborated version of it. This output is for the job seeker's own " +
    "practice/comparison only — it is never submitted anywhere automatically. Follow these rules " +
    "strictly:\n" +
    "- Pick whichever phrasing, structure, and level of detail best represents the job seeker for " +
    "this role from either source — you are reconciling two true drafts, not inventing a third.\n" +
    "- You must NEVER invent, add, or imply an employer, job title, date range, credential, " +
    "certification, or achievement that is not present in at least one of the two source resumes.\n" +
    "- Use whichever contact header is most complete and accurate; they should already match or " +
    "nearly match since both describe the same person."
  );
}

function buildUserPrompt(sourceA: MeldSourceInput, sourceB: MeldSourceInput, company: string, role: string): string {
  return (
    `TARGET JOB — ROLE: ${role}\nCOMPANY: ${company}\n\n` +
    `${sourceA.label.toUpperCase()}:\n${sourceA.text}\n\n` +
    `${sourceB.label.toUpperCase()}:\n${sourceB.text}`
  );
}

/**
 * Blends any two of the workspace's three resumes (reference/improved/
 * benchmark, never a resume with itself) into one hybrid resume. Never used
 * for a real application — illustrative only, like generateBenchmarkResume.ts
 * and generateImprovedResume.ts.
 */
export async function generateMeldedResume(
  sourceA: MeldSourceInput,
  sourceB: MeldSourceInput,
  company: string,
  role: string
): Promise<MeldedResume> {
  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    // 8192 (not 4096) — this call reasons over two full resumes plus
    // adaptive thinking before producing a third; 4096 occasionally
    // truncated the JSON output mid-stream ("response was not valid JSON").
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: MELDED_RESUME_SCHEMA } },
    system: buildSystemPrompt(sourceA.kind, sourceB.kind),
    messages: [{ role: "user", content: buildUserPrompt(sourceA, sourceB, company, role) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error(`Claude did not return structured resume content (stop_reason: ${response.stop_reason}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidMeldedResumeError(`response was not valid JSON (stop_reason: ${response.stop_reason})`);
  }

  const result = MeldedResumeZ.safeParse(parsed);
  if (!result.success) {
    throw new InvalidMeldedResumeError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}
