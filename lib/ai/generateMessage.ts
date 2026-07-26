import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { claude, CLAUDE_MODEL } from "./claudeClient";
import { SYSTEM_PROMPT } from "./prompts/shared";
import { buildImmediateOutreachPrompt } from "./prompts/immediateOutreach";
import { buildFollowUpPrompt } from "./prompts/followUpNoUpdate";

export type MessageType = "IMMEDIATE" | "FOLLOW_UP";

export async function generateMessage(applicationId: string, type: MessageType) {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { decisionMakers: true },
  });

  const userPrompt =
    type === "IMMEDIATE"
      ? buildImmediateOutreachPrompt(application, application.decisionMakers)
      : buildFollowUpPrompt(
          application,
          application.decisionMakers,
          application.appliedAt
            ? Math.floor((Date.now() - application.appliedAt.getTime()) / 86_400_000)
            : 7
        );

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const draftText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return prisma.message.create({
    data: {
      applicationId,
      type,
      draftText,
      status: "DRAFT",
    },
  });
}
