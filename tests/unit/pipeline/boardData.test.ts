import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { listPipelineCards } from "@/lib/pipeline/boardData";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("listPipelineCards", () => {
  it("projects this user's applications with stage ages and follow-up flags", async () => {
    const user = await prisma.user.create({ data: { username: "board-data-user", passwordHash: "unused" } });
    const fresh = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const followUpDue = await prisma.application.create({
      data: {
        userId: user.id,
        company: "Beta",
        role: "Analyst",
        source: "usajobs",
        status: "Submitted",
        submissionState: "confirmed",
        appliedAt: new Date(Date.now() - 8 * DAY_MS),
      },
    });

    const other = await prisma.user.create({ data: { username: "board-data-other", passwordHash: "unused" } });
    await prisma.application.create({
      data: { userId: other.id, company: "Hidden Co", role: "Engineer", source: "manual" },
    });

    const cards = await listPipelineCards(user.id);

    expect(cards.map((card) => card.company).sort()).toEqual(["Acme", "Beta"]);
    const acme = cards.find((card) => card.id === fresh.id);
    expect(acme).toMatchObject({ status: "Sourced", source: "manual", stageAgeLabel: "today", stageAgeStale: false, followUpDue: false });
    const beta = cards.find((card) => card.id === followUpDue.id);
    expect(beta).toMatchObject({ status: "Submitted", source: "usajobs", followUpDue: true });
  });

  it("surfaces each card's next open task, ignoring snoozed and completed ones", async () => {
    const user = await prisma.user.create({ data: { username: "board-next-action-user", passwordHash: "unused" } });
    const busy = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const quiet = await prisma.application.create({
      data: { userId: user.id, company: "Beta", role: "Analyst", source: "manual" },
    });

    await prisma.task.create({
      data: { userId: user.id, applicationId: busy.id, title: "Due later", dueAt: new Date(Date.now() + 2 * DAY_MS) },
    });
    await prisma.task.create({
      data: { userId: user.id, applicationId: busy.id, title: "Due sooner", dueAt: new Date(Date.now() + DAY_MS) },
    });
    await prisma.task.create({
      data: { userId: user.id, applicationId: quiet.id, title: "Snoozed", snoozedUntil: new Date(Date.now() + DAY_MS) },
    });
    await prisma.task.create({
      data: { userId: user.id, applicationId: quiet.id, title: "Done", completedAt: new Date() },
    });

    const cards = await listPipelineCards(user.id);

    expect(cards.find((card) => card.id === busy.id)?.nextAction).toBe("Due sooner");
    expect(cards.find((card) => card.id === quiet.id)?.nextAction).toBeNull();
  });
});
