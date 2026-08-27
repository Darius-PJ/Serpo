import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { listFollowUpDue } from "@/lib/scheduler/followUpCheck";

describe("follow-up review queue", () => {
  it("lists only confirmed submissions that need user review and does not generate a message", async () => {
    const user = await prisma.user.create({ data: { username: "followup-user", passwordHash: "unused" } });
    const appliedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const eligible = await prisma.application.create({
      data: {
        userId: user.id,
        company: "Eligible Co",
        role: "Engineer",
        source: "manual",
        status: "Submitted",
        appliedAt,
        submissionState: "confirmed",
      },
    });
    await prisma.application.create({
      data: {
        userId: user.id,
        company: "Unconfirmed Co",
        role: "Engineer",
        source: "manual",
        status: "Submitted",
        appliedAt,
        submissionState: "review_required",
      },
    });
    await prisma.application.create({
      data: {
        userId: user.id,
        company: "Already Drafted Co",
        role: "Engineer",
        source: "manual",
        status: "Submitted",
        appliedAt,
        submissionState: "confirmed",
        followUpGeneratedAt: new Date(),
      },
    });

    await expect(listFollowUpDue(user.id)).resolves.toEqual([{ id: eligible.id }]);
    await expect(prisma.message.findMany({ where: { application: { userId: user.id } } })).resolves.toHaveLength(0);
  });
});
