import type { Application, DecisionMaker } from "@/generated/prisma";
import { describeApplication } from "./shared";

export function buildFollowUpPrompt(application: Application, decisionMakers: DecisionMaker[], daysSinceApplied: number) {
  return (
    `I applied for this role ${daysSinceApplied} days ago and haven't heard back:\n\n` +
    `${describeApplication(application, decisionMakers)}\n\n` +
    "Draft a polite follow-up note checking on my application status. Reaffirm interest in the " +
    "role, don't sound impatient or entitled, and make it easy for them to give a quick update " +
    "either way."
  );
}
