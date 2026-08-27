import "server-only";
import { prisma } from "@/lib/db/prisma";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Lists follow-ups that need the user's review; it never calls an AI provider or mutates data. */
export async function listFollowUpDue(userId: string) {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

  return prisma.application.findMany({
    where: {
      userId,
      status: "Submitted",
      submissionState: "confirmed",
      appliedAt: { lte: cutoff },
      followUpGeneratedAt: null,
    },
    select: { id: true },
  });
}

/** Whether an application's 7-day follow-up window is open. Keeps the time math out of component render bodies (React's purity rule rejects Date.now() during render). */
export function isFollowUpDue(
  application: { appliedAt: Date | null; followUpGeneratedAt: Date | null },
  now: number = Date.now(),
): boolean {
  if (!application.appliedAt || application.followUpGeneratedAt) return false;
  return application.appliedAt.getTime() <= now - SEVEN_DAYS_MS;
}
