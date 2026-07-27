import "server-only";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";
import { BENCHMARK_RESUME_SCHEMA, BenchmarkResumeZ, InvalidBenchmarkResumeError, type BenchmarkResume } from "./benchmarkResumeSchema";

const SYSTEM_PROMPT =
  "You generate an illustrative example resume representing a strong, competitive candidate for " +
  "a specific job posting. This is NOT a real person and is never submitted anywhere — it's shown " +
  "to a job seeker purely so they can gauge the caliber of application they're likely competing " +
  "against. Follow these rules strictly:\n" +
  '- Use an obviously generic placeholder name and contact details (e.g. "Alex Morgan", ' +
  '"alex.morgan@example.com") — never a real, identifiable person.\n' +
  "- Invent plausible but clearly fictional employer names for past experience — never name a " +
  "real, identifiable company.\n" +
  "- Synthesize a background (experience, skills, education) deliberately and closely matched to " +
  "what the job description asks for — the specific tools, years of experience, certifications, " +
  "and qualifications it mentions. Make it realistic and well-written: the kind of resume that " +
  "would genuinely be competitive for this exact role. That's the whole point of the exercise.\n" +
  "- If the job description is thin or missing, infer the typical requirements for a role with " +
  "that title and generate a plausible strong-fit candidate anyway.";

function buildUserPrompt(company: string, role: string, jobDescription?: string): string {
  return (
    `ROLE: ${role}\nCOMPANY: ${company}\n\n` +
    (jobDescription
      ? `JOB DESCRIPTION:\n${jobDescription}`
      : "JOB DESCRIPTION: (none captured — infer typical requirements for this role/title)")
  );
}

/**
 * Generates a synthetic, illustrative "competitive benchmark" resume for a
 * job posting. Unlike lib/apply/tailorResume.ts, fabrication is expected and
 * intentional here — the output is clearly fictional and only ever shown
 * on-screen in the Resume tab, never used to apply anywhere.
 */
export async function generateBenchmarkResume(
  company: string,
  role: string,
  jobDescription?: string
): Promise<BenchmarkResume> {
  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    // 8192 (not 4096) — adaptive thinking plus a detailed multi-role resume
    // can leave too little budget for the full JSON output at 4096,
    // truncating it mid-stream ("response was not valid JSON").
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: BENCHMARK_RESUME_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(company, role, jobDescription) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error(`Claude did not return structured resume content (stop_reason: ${response.stop_reason}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidBenchmarkResumeError(`response was not valid JSON (stop_reason: ${response.stop_reason})`);
  }

  const result = BenchmarkResumeZ.safeParse(parsed);
  if (!result.success) {
    throw new InvalidBenchmarkResumeError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}
