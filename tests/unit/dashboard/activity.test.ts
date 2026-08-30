import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { describeAuditAction, listRecentActivity } from "@/lib/dashboard/activity";

describe("describeAuditAction", () => {
  it("maps known actions to human labels and falls back to the raw action", () => {
    expect(describeAuditAction("application.submission_confirmed")).toBe("Submission confirmed");
    expect(describeAuditAction("some.future_action")).toBe("some.future_action");
  });
});

describe("listRecentActivity", () => {
  it("returns this user's newest events first with application subjects resolved", async () => {
    const user = await prisma.user.create({ data: { username: "activity-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const older = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 1 * 60 * 60 * 1000);
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        action: "application.submission_confirmed",
        entityType: "Application",
        entityId: application.id,
        createdAt: older,
      },
    });
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        action: "application.submission_confirmed",
        entityType: "Application",
        entityId: "deleted-application-id",
        createdAt: newer,
      },
    });

    const otherUser = await prisma.user.create({ data: { username: "activity-other-user", passwordHash: "unused" } });
    await prisma.auditEvent.create({
      data: {
        userId: otherUser.id,
        action: "application.submission_confirmed",
        entityType: "Application",
        entityId: application.id,
      },
    });

    const entries = await listRecentActivity(user.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ label: "Submission confirmed", subject: null, createdAt: newer });
    expect(entries[1]).toMatchObject({ label: "Submission confirmed", subject: "Acme — Engineer", createdAt: older });
  });

  it("honors the limit", async () => {
    const user = await prisma.user.create({ data: { username: "activity-limit-user", passwordHash: "unused" } });
    for (let index = 0; index < 3; index++) {
      await prisma.auditEvent.create({
        data: {
          userId: user.id,
          action: `test.event_${index}`,
          entityType: "Application",
          entityId: "none",
          createdAt: new Date(Date.now() - index * 1000),
        },
      });
    }
    const entries = await listRecentActivity(user.id, 2);
    expect(entries.map((entry) => entry.label)).toEqual(["test.event_0", "test.event_1"]);
  });
});
