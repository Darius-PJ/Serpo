import "server-only";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";
import { IMPROVED_RESUME_SCHEMA, ImprovedResumeZ, InvalidImprovedResumeError, type ImprovedResume } from "./improvedResumeSchema";

const SYSTEM_PROMPT =
  "You help a job seeker see how their own real resume could be expanded and better articulated — " +
  "either for a specific target job, or generally for job searching if no specific job is given. " +
  "You are given their actual uploaded resume text. This output is for the job seeker's own " +
  "practice/comparison only — it is never submitted anywhere automatically. Follow these rules " +
  "strictly:\n" +
  "- You may reorder, re-emphasize, and rephrase content freely, exactly like a normal resume " +
  "tailoring pass.\n" +
  "- You may ELABORATE: flesh out bullets that are thin or vague with plausible additional detail " +
  "(scope, tools, outcomes) that is a reasonable, defensible reading of what's already stated — " +
  "not a new claim.\n" +
  "- You may ADD highly-plausible implied skills — a skill or tool that is near-certainly implied " +
  "by something already stated (e.g. someone who \"built REST APIs in Node.js\" plausibly knows " +
  "JSON and HTTP) — but only when the inference is obvious and low-risk.\n" +
  "- You must NEVER invent, add, or imply an employer, job title, date range, credential, " +
  "certification, or achievement that has no reasonable basis in the source resume text, even if " +
  "the job description asks for it. If the source resume genuinely lacks something relevant, say " +
  "so by omission — omission is always correct, invention never is.\n" +
  "- Copy the contact header (name/email/phone/location/links) from the source text exactly, " +
  "unchanged.";

function buildUserPrompt(sourceResumeText: string, company?: string, role?: string, jobDescription?: string): string {
  const targetSection =
    company && role
      ? `TARGET JOB — ROLE: ${role}\nCOMPANY: ${company}\n\n` +
        (jobDescription ? `JOB DESCRIPTION:\n${jobDescription}` : "JOB DESCRIPTION: (none captured)")
      : "TARGET JOB: none specified — improve and expand this resume generally for job searching, without targeting one specific posting.";
  return `SOURCE RESUME TEXT:\n${sourceResumeText}\n\n${targetSection}`;
}

/**
 * Generates an "improved" version of the user's own uploaded resume, either
 * aimed at a specific target job (company/role given) or generally for job
 * searching (both omitted — the Resume tab's "general workspace" mode).
 * Distinct from lib/apply/tailorResume.ts (which strictly only reorders/
 * rephrases for a REAL application) — this may elaborate and add
 * highly-plausible implied skills, but never fabricates a new employer/
 * title/date/credential. Illustrative only, like generateBenchmarkResume.ts,
 * never used to apply anywhere.
 */
export async function generateImprovedResume(
  sourceResumeText: string,
  company?: string,
  role?: string,
  jobDescription?: string
): Promise<ImprovedResume> {
  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    // 8192 (not 4096) — a long source resume plus adaptive thinking can
    // leave too little budget for the full JSON output at 4096, truncating
    // it mid-stream ("response was not valid JSON").
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: IMPROVED_RESUME_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(sourceResumeText, company, role, jobDescription) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error(`Claude did not return structured resume content (stop_reason: ${response.stop_reason}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidImprovedResumeError(`response was not valid JSON (stop_reason: ${response.stop_reason})`);
  }

  const result = ImprovedResumeZ.safeParse(parsed);
  if (!result.success) {
    throw new InvalidImprovedResumeError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}
