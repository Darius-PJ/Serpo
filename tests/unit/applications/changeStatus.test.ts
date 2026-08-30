import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { changeApplicationStatus } from "@/lib/applications/changeStatus";

describe("changeApplicationStatus", () => {
  it("updates the status and records a status_changed audit event with the transition", async () => {
    const user = await prisma.user.create({ data: { username: "status-change-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });

    const updated = await changeApplicationStatus(user.id, application.id, "Interviewing");

    expect(updated?.status).toBe("Interviewing");
    const events = await prisma.auditEvent.findMany({
      where: { userId: user.id, action: "application.status_changed" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entityType: "Application", entityId: application.id });
    expect(JSON.parse(events[0].details ?? "{}")).toEqual({ from: "Sourced", to: "Interviewing" });
  });

  it("treats the first move into Submitted as a confirmed submission and keeps the original timestamps after", async () => {
    const user = await prisma.user.create({ data: { username: "status-submit-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });

    const submitted = await changeApplicationStatus(user.id, application.id, "Submitted");
    expect(submitted?.submissionState).toBe("confirmed");
    expect(submitted?.appliedAt).not.toBeNull();
    expect(submitted?.submissionConfirmedAt).not.toBeNull();

    await changeApplicationStatus(user.id, application.id, "Interviewing");
    const again = await changeApplicationStatus(user.id, application.id, "Submitted");
    expect(again?.appliedAt).toEqual(submitted?.appliedAt);
    expect(again?.submissionConfirmedAt).toEqual(submitted?.submissionConfirmedAt);
  });

  it("is a no-op without an audit event when the status is unchanged", async () => {
    const user = await prisma.user.create({ data: { username: "status-noop-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });

    const result = await changeApplicationStatus(user.id, application.id, "Sourced");

    expect(result?.status).toBe("Sourced");
    await expect(
      prisma.auditEvent.findMany({ where: { userId: user.id, action: "application.status_changed" } }),
    ).resolves.toHaveLength(0);
  });

  it("returns null and writes nothing for another user's application", async () => {
    const owner = await prisma.user.create({ data: { username: "status-owner-user", passwordHash: "unused" } });
    const intruder = await prisma.user.create({ data: { username: "status-intruder-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: owner.id, company: "Acme", role: "Engineer", source: "manual" },
    });

    await expect(changeApplicationStatus(intruder.id, application.id, "Withdrawn")).resolves.toBeNull();

    await expect(prisma.application.findUnique({ where: { id: application.id } })).resolves.toMatchObject({
      status: "Sourced",
    });
    await expect(prisma.auditEvent.findMany({ where: { action: "application.status_changed", entityId: application.id } })).resolves.toHaveLength(0);
  });
});
