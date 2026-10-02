import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { enqueueJob, savedSearchJobKeyPrefix } from "@/lib/automation/jobs";
import { enqueueDue } from "@/lib/automation/schedule";
import { updateAutomationPreferences } from "@/lib/automation/settings";

const DAY_MS = 24 * 60 * 60 * 1000;
// 11:30 EDT on Monday 2026-09-28.
const NOW = new Date("2026-09-28T15:30:00Z");
const WEEK_AGO = new Date(NOW.getTime() - 7 * DAY_MS);

let seq = 0;
async function makeUser(preferences: { enabled: boolean; timezone: string }) {
  seq++;
  const user = await prisma.user.create({ data: { username: `schedule-user-${seq}`, passwordHash: "unused" } });
  await updateAutomationPreferences(user.id, preferences);
  return user;
}

function makeSearch(userId: string, data: { cadence: string; nextRunAt: Date; enabled?: boolean }) {
  return prisma.savedSearch.create({ data: { userId, name: `${data.cadence} search`, keywords: "frontend engineer", ...data } });
}

describe("enqueueDue", () => {
  it("runs a search that missed many windows once, in the current slot, then waits for the next slot", async () => {
    const user = await makeUser({ enabled: true, timezone: "America/New_York" });
    const daily = await makeSearch(user.id, { cadence: "daily", nextRunAt: WEEK_AGO });
    const sixHourly = await makeSearch(user.id, { cadence: "every_6h", nextRunAt: new Date(NOW.getTime() - 3 * DAY_MS) });

    await enqueueDue(NOW);

    const runs = await prisma.automationJob.findMany({ where: { userId: user.id, kind: "saved_search.run" } });
    expect(runs.map((job) => job.idempotencyKey).sort()).toEqual(
      [
        // Today's 00:00 EDT and 06:00 EDT slots.
        `${savedSearchJobKeyPrefix(daily.id)}2026-09-28T04:00:00.000Z`,
        `${savedSearchJobKeyPrefix(sixHourly.id)}2026-09-28T10:00:00.000Z`,
      ].sort(),
    );
    // Tomorrow's 00:00 EDT and today's 12:00 EDT.
    await expect(prisma.savedSearch.findUnique({ where: { id: daily.id } })).resolves.toMatchObject({
      nextRunAt: new Date("2026-09-29T04:00:00Z"),
    });
    await expect(prisma.savedSearch.findUnique({ where: { id: sixHourly.id } })).resolves.toMatchObject({
      nextRunAt: new Date("2026-09-28T16:00:00Z"),
    });

    const jobCount = await prisma.automationJob.count({ where: { userId: user.id } });
    await expect(enqueueDue(NOW)).resolves.toBe(0);
    await expect(prisma.automationJob.count({ where: { userId: user.id } })).resolves.toBe(jobCount);
  });

  it("enqueues only the two daily scans when automation is off", async () => {
    const user = await makeUser({ enabled: false, timezone: "America/New_York" });
    await makeSearch(user.id, { cadence: "daily", nextRunAt: WEEK_AGO });

    await enqueueDue(NOW);

    const jobs = await prisma.automationJob.findMany({ where: { userId: user.id } });
    expect(jobs.map((job) => job.kind).sort()).toEqual(["followup.scan", "stale.scan"]);
  });

  it("skips a paused search", async () => {
    const user = await makeUser({ enabled: true, timezone: "America/New_York" });
    await makeSearch(user.id, { cadence: "daily", nextRunAt: WEEK_AGO, enabled: false });

    await enqueueDue(NOW);

    await expect(prisma.automationJob.count({ where: { userId: user.id, kind: "saved_search.run" } })).resolves.toBe(0);
  });

  it("enqueues each daily scan once per local day, in each user's own timezone", async () => {
    const tokyo = await makeUser({ enabled: false, timezone: "Asia/Tokyo" });
    const losAngeles = await makeUser({ enabled: false, timezone: "America/Los_Angeles" });

    // 23:00 on Sept 28 in Tokyo; 07:00 on Sept 28 in Los Angeles.
    await expect(enqueueDue(new Date("2026-09-28T14:00:00Z"))).resolves.toBe(4);
    // Half an hour later: the same local day in both zones.
    await expect(enqueueDue(new Date("2026-09-28T14:30:00Z"))).resolves.toBe(0);
    // Midnight Sept 29 in Tokyo, still Sept 28 in Los Angeles (and in UTC).
    await expect(enqueueDue(new Date("2026-09-28T15:00:00Z"))).resolves.toBe(2);

    const tokyoKeys = await prisma.automationJob.findMany({ where: { userId: tokyo.id }, select: { idempotencyKey: true } });
    expect(tokyoKeys.map((job) => job.idempotencyKey).sort()).toEqual([
      `followup.scan:${tokyo.id}:2026-09-28`,
      `followup.scan:${tokyo.id}:2026-09-29`,
      `stale.scan:${tokyo.id}:2026-09-28`,
      `stale.scan:${tokyo.id}:2026-09-29`,
    ]);
    await expect(prisma.automationJob.count({ where: { userId: losAngeles.id } })).resolves.toBe(2);
  });
});

describe("enqueueJob", () => {
  it("treats an existing idempotency key as a no-op", async () => {
    const user = await makeUser({ enabled: false, timezone: "America/New_York" });
    const job = { userId: user.id, kind: "stale.scan" as const, idempotencyKey: `stale.scan:${user.id}:2026-09-28`, runAt: NOW };

    await expect(enqueueJob(job)).resolves.toBe(true);
    await expect(enqueueJob({ ...job, runAt: new Date(NOW.getTime() + DAY_MS) })).resolves.toBe(false);

    const rows = await prisma.automationJob.findMany({ where: { idempotencyKey: job.idempotencyKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0].runAt).toEqual(NOW);
  });

  it("with rearmFinished, queues a done or dead job again but leaves a queued or running one alone", async () => {
    const user = await makeUser({ enabled: false, timezone: "America/New_York" });
    const earlier = new Date(NOW.getTime() - DAY_MS);
    const rows = {
      done: { status: "done", attempts: 1, finishedAt: earlier },
      dead: { status: "dead", attempts: 4, finishedAt: earlier, lastError: "HTTP 503" },
      queued: { status: "queued", attempts: 0 },
      running: { status: "running", attempts: 2, lockedAt: earlier, lastError: "HTTP 503" },
    };
    for (const [status, data] of Object.entries(rows)) {
      await prisma.automationJob.create({
        data: { userId: user.id, kind: "outreach.prepare", idempotencyKey: `outreach:${status}`, runAt: earlier, ...data },
      });
    }

    for (const status of Object.keys(rows)) {
      const rearmed = await enqueueJob(
        { userId: user.id, kind: "outreach.prepare", idempotencyKey: `outreach:${status}`, runAt: NOW },
        { rearmFinished: true },
      );
      expect(rearmed, status).toBe(status === "done" || status === "dead");
    }

    const byKey = new Map(
      (await prisma.automationJob.findMany({ where: { userId: user.id } })).map((job) => [job.idempotencyKey, job]),
    );
    expect(byKey.size).toBe(4);
    for (const status of ["done", "dead"]) {
      expect(byKey.get(`outreach:${status}`)).toMatchObject({ status: "queued", attempts: 0, lastError: null, finishedAt: null, runAt: NOW });
    }
    expect(byKey.get("outreach:queued")).toMatchObject({ status: "queued", attempts: 0, runAt: earlier });
    expect(byKey.get("outreach:running")).toMatchObject({ status: "running", attempts: 2, lockedAt: earlier, runAt: earlier });
  });
});
