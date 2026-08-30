import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { listAttentionItems } from "@/lib/dashboard/attention";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("attention queue", () => {
  it("merges stuck apply runs, message drafts, and due follow-ups in priority order, oldest first within each kind", async () => {
    const user = await prisma.user.create({ data: { username: "attention-merge-user", passwordHash: "unused" } });
    const oldest = new Date(Date.now() - 3 * DAY_MS);
    const middle = new Date(Date.now() - 2 * DAY_MS);
    const newest = new Date(Date.now() - 1 * DAY_MS);

    const acme = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    await prisma.applyRun.create({ data: { applicationId: acme.id, status: "blocked", startedAt: oldest } });
    await prisma.applyRun.create({
      data: { applicationId: acme.id, status: "needs_input", missingFieldLabel: "Work authorization", startedAt: newest },
    });

    const beta = await prisma.application.create({
      data: { userId: user.id, company: "Beta", role: "Analyst", source: "manual" },
    });
    await prisma.applyRun.create({ data: { applicationId: beta.id, status: "failed", startedAt: middle } });
    await prisma.message.create({
      data: { applicationId: beta.id, type: "FOLLOW_UP", draftText: "draft", status: "DRAFT", createdAt: newest },
    });

    const appliedAt = new Date(Date.now() - 8 * DAY_MS);
    const gamma = await prisma.application.create({
      data: {
        userId: user.id,
        company: "Gamma",
        role: "Technician",
        source: "manual",
        status: "Submitted",
        submissionState: "confirmed",
        appliedAt,
      },
    });
    await prisma.applyRun.create({ data: { applicationId: gamma.id, status: "review_required", startedAt: newest } });

    const items = await listAttentionItems(user.id);

    expect(items.map((item) => [item.kind, item.company, item.detail])).toEqual([
      ["apply_run", "Acme", "Apply run blocked"],
      ["apply_run", "Beta", "Apply run failed"],
      ["apply_run", "Acme", "Apply run needs input: Work authorization"],
      ["apply_run", "Gamma", "Apply run awaiting your review"],
      ["message_draft", "Beta", "Follow-up draft awaiting approval"],
      ["follow_up_due", "Gamma", "7-day follow-up due"],
    ]);
    expect(items[0].applicationId).toBe(acme.id);
    expect(items[0].since).toEqual(oldest);
    expect(items.at(-1)?.since).toEqual(appliedAt);
  });

  it("puts due user tasks first, with application context when linked, skipping future-dated and snoozed ones", async () => {
    const user = await prisma.user.create({ data: { username: "attention-task-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });

    const dueAt = new Date(Date.now() - 2 * DAY_MS);
    const linked = await prisma.task.create({
      data: { userId: user.id, title: "Prep phone screen", dueAt, applicationId: application.id },
    });
    const standalone = await prisma.task.create({ data: { userId: user.id, title: "Update resume" } });
    await prisma.task.create({ data: { userId: user.id, title: "Future", dueAt: new Date(Date.now() + DAY_MS) } });
    await prisma.task.create({ data: { userId: user.id, title: "Snoozed", snoozedUntil: new Date(Date.now() + DAY_MS) } });
    await prisma.message.create({
      data: { applicationId: application.id, type: "IMMEDIATE", draftText: "draft", status: "DRAFT" },
    });

    const items = await listAttentionItems(user.id);

    expect(items.map((item) => [item.kind, item.detail])).toEqual([
      ["task", "Prep phone screen"],
      ["task", "Update resume"],
      ["message_draft", "Outreach draft awaiting approval"],
    ]);
    expect(items[0]).toMatchObject({ taskId: linked.id, applicationId: application.id, company: "Acme", role: "Engineer" });
    expect(items[0].since).toEqual(dueAt);
    expect(items[1]).toMatchObject({ taskId: standalone.id, applicationId: null, company: null, role: null });
  });

  it("excludes healthy apply runs, approved and sent messages, and other users' data", async () => {
    const quietUser = await prisma.user.create({ data: { username: "attention-quiet-user", passwordHash: "unused" } });
    const quietApp = await prisma.application.create({
      data: { userId: quietUser.id, company: "Calm Co", role: "Engineer", source: "manual" },
    });
    await prisma.applyRun.create({ data: { applicationId: quietApp.id, status: "submitted" } });
    await prisma.applyRun.create({ data: { applicationId: quietApp.id, status: "pending" } });
    await prisma.applyRun.create({ data: { applicationId: quietApp.id, status: "unknown" } });
    await prisma.message.create({
      data: { applicationId: quietApp.id, type: "IMMEDIATE", draftText: "sent", status: "SENT" },
    });
    await prisma.message.create({
      data: { applicationId: quietApp.id, type: "IMMEDIATE", draftText: "approved", status: "APPROVED" },
    });

    const busyUser = await prisma.user.create({ data: { username: "attention-busy-user", passwordHash: "unused" } });
    const busyApp = await prisma.application.create({
      data: { userId: busyUser.id, company: "Busy Co", role: "Engineer", source: "manual" },
    });
    await prisma.applyRun.create({ data: { applicationId: busyApp.id, status: "needs_input" } });
    await prisma.message.create({
      data: { applicationId: busyApp.id, type: "IMMEDIATE", draftText: "draft", status: "DRAFT" },
    });

    await expect(listAttentionItems(quietUser.id)).resolves.toEqual([]);
    await expect(listAttentionItems(busyUser.id)).resolves.toMatchObject([
      { kind: "apply_run", company: "Busy Co", detail: "Apply run needs input" },
      { kind: "message_draft", company: "Busy Co", detail: "Outreach draft awaiting approval" },
    ]);
  });
});
