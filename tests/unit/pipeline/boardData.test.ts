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
});
