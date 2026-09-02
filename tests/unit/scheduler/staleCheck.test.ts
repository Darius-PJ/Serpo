import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { keepApplication } from "@/lib/privacy/purge";
import { runStaleCheck } from "@/lib/scheduler/staleCheck";

describe("stale review cadence", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps stage age intact and does not immediately re-flag an application the user kept", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const user = await prisma.user.create({ data: { username: "stale-cadence", passwordHash: "unused" } });
    const stageStartedAt = new Date("2025-01-01T00:00:00.000Z");
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        company: "Acme",
        role: "Engineer",
        source: "manual",
        lastStatusChangeAt: stageStartedAt,
        staleFlaggedAt: new Date(),
      },
    });

    const kept = await keepApplication(application.id, user.id);
    expect(kept.lastStatusChangeAt).toEqual(stageStartedAt);
    await expect(runStaleCheck(user.id)).resolves.toBe(0);
  });
});
