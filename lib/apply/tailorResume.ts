import "server-only";
import { prisma } from "@/lib/db/prisma";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";
import { TAILORED_RESUME_SCHEMA, TailoredResumeZ, InvalidTailoredResumeError, type TailoredResume } from "./resumeSchema";

const SYSTEM_PROMPT =
  "You tailor a job seeker's resume to a specific job description. You may ONLY reorder, " +
  "re-emphasize, and rephrase content that already exists in the source resume text below — " +
  "select which existing bullets to foreground, and phrase them to speak to the job description. " +
  "You must NEVER invent, add, or imply an employer, job title, date range, skill, credential, " +
  "or achievement that is not present in the source resume text, even if the job description asks " +
  "for it and the source resume doesn't have it. If the source resume genuinely lacks something " +
  "relevant, simply don't fabricate it — omission is always correct, invention never is. Copy the " +
  "contact header (name/email/phone/location/links) from the source text exactly, unchanged.";

export async function tailorResume(applicationId: string, userId: string): Promise<TailoredResume> {
  const [template, application] = await Promise.all([
    // Scoped to this account — otherwise a shared "most recent template"
    // lookup would tailor User B's real application against User A's résumé.
    prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.application.findUniqueOrThrow({ where: { id_userId: { id: applicationId, userId } } }),
  ]);

  if (!template) {
    throw new Error("No resume template uploaded yet.");
  }

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: TAILORED_RESUME_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `SOURCE RESUME TEXT:\n${template.contentText}\n\n` +
          `JOB DESCRIPTION (${application.role} at ${application.company}):\n${application.description ?? "(none captured)"}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error("Claude did not return structured resume content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidTailoredResumeError("response was not valid JSON");
  }

  const result = TailoredResumeZ.safeParse(parsed);
  if (!result.success) {
    throw new InvalidTailoredResumeError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}
