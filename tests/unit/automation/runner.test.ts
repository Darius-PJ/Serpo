import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationJob } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { PermanentJobError } from "@/lib/automation/errors";
import { listFailedAutomation, retryDeadJob } from "@/lib/automation/jobs";
import { claimNextJob, LOCK_TIMEOUT_MS, recoverStaleLocks, runDueJobs, type JobContext } from "@/lib/automation/runner";

const MINUTE_MS = 60_000;
const T0 = new Date("2026-09-28T12:00:00Z");

let seq = 0;
async function makeUser() {
  seq++;
  return prisma.user.create({ data: { username: `runner-user-${seq}`, passwordHash: "unused" } });
}

function queueJob(userId: string, idempotencyKey: string, runAt = T0) {
  return prisma.automationJob.create({ data: { userId, kind: "stale.scan", idempotencyKey, runAt } });
}

function jobRow(id: string) {
  return prisma.automationJob.findUniqueOrThrow({ where: { id } });
}

describe("automation runner", () => {
  beforeEach(() => {
    // The runner logs every failed attempt; these tests fail jobs on purpose.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("marks a job done when its handler succeeds", async () => {
    const user = await makeUser();
    const job = await queueJob(user.id, "succeeds");
    const finishedAt = new Date(T0.getTime() + MINUTE_MS);

    await expect(runDueJobs({ "stale.scan": async () => {} }, () => finishedAt)).resolves.toBe(1);

    await expect(jobRow(job.id)).resolves.toMatchObject({ status: "done", finishedAt, lockedAt: null, attempts: 1 });
  });

  it("retries a failure 5 min, 30 min, then 2 h after it failed (not before), flags only the fourth attempt final, and marks it dead", async () => {
    const user = await makeUser();
    const job = await queueJob(user.id, "flaky");
    let now = T0;
    const contexts: JobContext[] = [];
    const handlers = {
      "stale.scan": async (_job: AutomationJob, context: JobContext) => {
        contexts.push(context);
        // Each attempt takes a minute, so the failure time differs from the claim time.
        now = new Date(now.getTime() + MINUTE_MS);
        throw new Error(`upstream unavailable on attempt ${context.attempt}`);
      },
    };
    const clock = () => now;

    for (const backoffMs of [5 * MINUTE_MS, 30 * MINUTE_MS, 120 * MINUTE_MS]) {
      await expect(runDueJobs(handlers, clock)).resolves.toBe(1);
      const failed = await jobRow(job.id);
      expect(failed).toMatchObject({ status: "failed", lockedAt: null, runAt: new Date(now.getTime() + backoffMs) });
      now = new Date(failed.runAt.getTime() - 1);
      await expect(runDueJobs(handlers, clock)).resolves.toBe(0);
      now = failed.runAt;
    }
    await expect(runDueJobs(handlers, clock)).resolves.toBe(1);

    await expect(jobRow(job.id)).resolves.toMatchObject({
      status: "dead",
      attempts: 4,
      lastError: "upstream unavailable on attempt 4",
      finishedAt: now,
    });
    expect(contexts).toEqual([
      { attempt: 1, finalAttempt: false },
      { attempt: 2, finalAttempt: false },
      { attempt: 3, finalAttempt: false },
      { attempt: 4, finalAttempt: true },
    ]);
  });

  it("marks a job dead on its first attempt for a PermanentJobError or a kind with no handler", async () => {
    const user = await makeUser();
    const permanent = await queueJob(user.id, "permanent");
    const unknownKind = await prisma.automationJob.create({
      data: { userId: user.id, kind: "retired.kind", idempotencyKey: "retired", runAt: T0 },
    });
    const handlers = {
      "stale.scan": async () => {
        throw new PermanentJobError("job payload has no applicationId");
      },
    };

    await expect(runDueJobs(handlers, () => T0)).resolves.toBe(2);

    await expect(jobRow(permanent.id)).resolves.toMatchObject({
      status: "dead",
      attempts: 1,
      lastError: "job payload has no applicationId",
    });
    await expect(jobRow(unknownKind.id)).resolves.toMatchObject({ status: "dead", attempts: 1 });
  });

  it("runs due jobs oldest first, one at a time, and leaves a job that is not yet due", async () => {
    const user = await makeUser();
    const middle = await queueJob(user.id, "middle", new Date(T0.getTime() - 2 * MINUTE_MS));
    const newest = await queueJob(user.id, "newest", new Date(T0.getTime() - MINUTE_MS));
    const oldest = await queueJob(user.id, "oldest", new Date(T0.getTime() - 3 * MINUTE_MS));
    const notYetDue = await queueJob(user.id, "not-yet-due", new Date(T0.getTime() + 1));
    const started: string[] = [];
    let running = 0;
    let mostAtOnce = 0;
    const handler = async (job: AutomationJob) => {
      started.push(job.id);
      mostAtOnce = Math.max(mostAtOnce, ++running);
      // Real I/O mid-handler: a runner that overlapped jobs would start the next one here.
      await jobRow(job.id);
      running--;
    };

    await expect(runDueJobs({ "stale.scan": handler }, () => T0)).resolves.toBe(3);

    expect(started).toEqual([oldest.id, middle.id, newest.id]);
    expect(mostAtOnce).toBe(1);
    await expect(jobRow(notYetDue.id)).resolves.toMatchObject({ status: "queued", attempts: 0 });
  });

  it("lets exactly one of two concurrent claims take a job", async () => {
    const user = await makeUser();
    const job = await queueJob(user.id, "contended");
    // Hold each claimer after it reads the job until both have, so both go on to try the update.
    const findFirst = prisma.automationJob.findFirst.bind(prisma.automationJob);
    let reads = 0;
    const barrier = Promise.withResolvers<void>();
    vi.spyOn(prisma.automationJob, "findFirst").mockImplementation((async (args: Parameters<typeof findFirst>[0]) => {
      const candidate = await findFirst(args);
      if (++reads === 2) barrier.resolve();
      if (reads <= 2) await barrier.promise;
      return candidate;
    }) as unknown as typeof findFirst);

    const claims = await Promise.all([claimNextJob(T0), claimNextJob(T0)]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    await expect(jobRow(job.id)).resolves.toMatchObject({ status: "running", attempts: 1 });
  });

  it("neither recreates nor chokes on a job deleted while its handler ran", async () => {
    const user = await makeUser();
    const succeeds = await queueJob(user.id, "deleted-then-succeeds", new Date(T0.getTime() - MINUTE_MS));
    await queueJob(user.id, "deleted-then-fails");
    const handler = async (job: AutomationJob) => {
      // What wipe-all does to a job mid-run.
      await prisma.automationJob.delete({ where: { id: job.id } });
      if (job.id !== succeeds.id) throw new Error("upstream unavailable");
    };

    await expect(runDueJobs({ "stale.scan": handler }, () => T0)).resolves.toBe(2);

    await expect(prisma.automationJob.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("returns a job orphaned mid-run to the queue with its attempt counted, gives up on an exhausted one, and leaves a live one", async () => {
    const user = await makeUser();
    const staleLock = new Date(T0.getTime() - LOCK_TIMEOUT_MS - MINUTE_MS);
    const freshLock = new Date(T0.getTime() - LOCK_TIMEOUT_MS + MINUTE_MS);
    const running = (idempotencyKey: string, attempts: number, lockedAt: Date) =>
      prisma.automationJob.create({
        data: { userId: user.id, kind: "stale.scan", idempotencyKey, status: "running", attempts, lockedAt, runAt: lockedAt },
      });
    const orphaned = await running("orphaned", 2, staleLock);
    const exhausted = await running("exhausted", 4, staleLock);
    const live = await running("live", 1, freshLock);

    await recoverStaleLocks(T0);

    await expect(jobRow(orphaned.id)).resolves.toMatchObject({ status: "queued", attempts: 2, lockedAt: null, runAt: T0 });
    await expect(jobRow(exhausted.id)).resolves.toMatchObject({
      status: "dead",
      lockedAt: null,
      finishedAt: T0,
      lastError: expect.any(String),
    });
    await expect(jobRow(live.id)).resolves.toMatchObject({ status: "running", attempts: 1, lockedAt: freshLock });

    const contexts: JobContext[] = [];
    await runDueJobs({ "stale.scan": async (_job, context) => void contexts.push(context) }, () => T0);
    expect(contexts).toEqual([{ attempt: 3, finalAttempt: false }]);
  });

  it("retryDeadJob re-queues this user's dead job and nothing else", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const dead = await prisma.automationJob.create({
      data: { userId: owner.id, kind: "stale.scan", idempotencyKey: "dead", status: "dead", attempts: 4, lastError: "HTTP 503", finishedAt: T0, runAt: T0 },
    });
    const retrying = await prisma.automationJob.create({
      data: { userId: owner.id, kind: "stale.scan", idempotencyKey: "retrying", status: "failed", attempts: 1, runAt: new Date(Date.now() + 60 * MINUTE_MS) },
    });

    await expect(retryDeadJob(stranger.id, dead.id)).resolves.toBe(false);
    await expect(retryDeadJob(owner.id, retrying.id)).resolves.toBe(false);
    await expect(jobRow(dead.id)).resolves.toMatchObject({ status: "dead", attempts: 4 });
    await expect(jobRow(retrying.id)).resolves.toMatchObject({ status: "failed", attempts: 1 });

    await expect(retryDeadJob(owner.id, dead.id)).resolves.toBe(true);
    await expect(jobRow(dead.id)).resolves.toMatchObject({ status: "queued", attempts: 0, lastError: null, finishedAt: null });
    // Due at once, with a full set of attempts ahead.
    await expect(claimNextJob(new Date())).resolves.toMatchObject({ id: dead.id, attempts: 1 });
  });

  it("listFailedAutomation describes dead outreach and saved-search jobs and leaves out those whose subject was deleted", async () => {
    const user = await makeUser();
    const stranger = await makeUser();
    const application = await prisma.application.create({ data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" } });
    const search = await prisma.savedSearch.create({ data: { userId: user.id, name: "Remote frontend", keywords: "frontend engineer" } });
    const deletedApplication = await prisma.application.create({ data: { userId: user.id, company: "Gone Co", role: "Engineer", source: "manual" } });
    const deletedSearch = await prisma.savedSearch.create({ data: { userId: user.id, name: "Gone search", keywords: "designer" } });
    const dead = (userId: string, kind: string, payload: Record<string, string>, finishedAt: Date, lastError: string) =>
      prisma.automationJob.create({
        data: {
          userId,
          kind,
          idempotencyKey: `${kind}:${Object.values(payload).join(":")}:${finishedAt.toISOString()}`,
          payload: JSON.stringify(payload),
          status: "dead",
          attempts: 4,
          lastError,
          finishedAt,
          runAt: finishedAt,
        },
      });
    const earlier = new Date(T0.getTime() - 60 * MINUTE_MS);
    const outreach = await dead(user.id, "outreach.prepare", { applicationId: application.id }, earlier, "Hunter.io: HTTP 503");
    const run = await dead(user.id, "saved_search.run", { savedSearchId: search.id }, T0, "Every source failed: RemoteOK");
    await dead(user.id, "outreach.prepare", { applicationId: deletedApplication.id }, earlier, "HTTP 503");
    await dead(user.id, "saved_search.run", { savedSearchId: deletedSearch.id }, earlier, "Every source failed: RemoteOK");
    await dead(stranger.id, "stale.scan", {}, earlier, "disk I/O error");
    await prisma.application.delete({ where: { id: deletedApplication.id } });
    await prisma.savedSearch.delete({ where: { id: deletedSearch.id } });

    const failures = await listFailedAutomation(user.id);

    expect(failures).toEqual([
      {
        jobId: outreach.id,
        kind: "outreach.prepare",
        applicationId: application.id,
        company: "Acme",
        role: "Engineer",
        detail: expect.stringContaining("HTTP 503"),
        since: earlier,
      },
      {
        jobId: run.id,
        kind: "saved_search.run",
        applicationId: null,
        company: null,
        role: null,
        detail: expect.stringContaining("Remote frontend"),
        since: T0,
      },
    ]);
    expect(failures[1].detail).toContain("Every source failed");
  });
});
