import type { Application, DecisionMaker } from "@/generated/prisma";
import { describeApplication } from "./shared";

export function buildImmediateOutreachPrompt(application: Application, decisionMakers: DecisionMaker[]) {
  return (
    `I just submitted my application for this role:\n\n${describeApplication(application, decisionMakers)}\n\n` +
    "Draft a brief note I can send right now to personalize my application in the eyes of " +
    "whoever reviews it — reference the role and company specifically, and if a decision-maker " +
    "name is given, address them directly. If no contact name is given, write it so it works as " +
    "a general note to whoever is reviewing applications."
  );
}
