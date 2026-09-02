import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getLocalUserId } from "@/lib/auth/session";

describe("single-user local workspace", () => {
  it("creates one local owner when the database is empty", async () => {
    const first = await getLocalUserId();
    const second = await getLocalUserId();

    expect(second).toBe(first);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: first } })).toMatchObject({ username: "local" });
  });

  it("reuses the oldest existing owner so upgrades preserve their data", async () => {
    const existing = await prisma.user.create({
      data: {
        username: "existing-owner",
        passwordHash: "legacy-password-hash",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await prisma.user.create({
      data: {
        username: "newer-owner",
        passwordHash: "legacy-password-hash",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });

    await expect(getLocalUserId()).resolves.toBe(existing.id);
  });

  it("adopts legacy rows that predate ownership", async () => {
    const application = await prisma.application.create({
      data: { company: "Legacy Co", role: "Analyst", source: "manual" },
    });

    const userId = await getLocalUserId();

    await expect(prisma.application.findUnique({ where: { id: application.id } })).resolves.toMatchObject({ userId });
  });
});
