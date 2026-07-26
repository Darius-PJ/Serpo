import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateMessage } from "@/lib/ai/generateMessage";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Generates a FOLLOW_UP draft for any application 7+ days past submission with no status change and no prior follow-up. */
export async function runFollowUpCheck() {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

  const due = await prisma.application.findMany({
    where: {
      status: "Submitted",
      appliedAt: { lte: cutoff },
      followUpGeneratedAt: null,
    },
  });

  const generated = [];
  for (const application of due) {
    const message = await generateMessage(application.id, "FOLLOW_UP");
    await prisma.application.update({
      where: { id: application.id },
      data: { followUpGeneratedAt: new Date() },
    });
    generated.push(message);
  }
  return generated;
}
