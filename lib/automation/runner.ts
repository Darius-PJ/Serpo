import "server-only";
import type { AutomationJob, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { PermanentJobError } from "./errors";

/** Wait before retry n (1-based). Attempts past the last entry reuse it. */
export const RETRY_BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/**
 * A job still running this long after its claim belongs to a server that
 * stopped mid-job. Longer than any real job: the slowest is a saved search
 * waiting out JobSpy's 15-minute Google spacing.
 */
export const LOCK_TIMEOUT_MS = 60 * 60_000;

const INTERRUPTED = "Interrupted: Serpo stopped while this job was running";

export interface JobContext {
  /** 1-based, counting this one. */
  attempt: number;
  /** No retry follows if this attempt fails. */
  finalAttempt: boolean;
}

export type JobHandler = (job: AutomationJob, context: JobContext) => Promise<void>;
export type JobHandlers = Record<string, JobHandler>;

/**
 * Claims the oldest due job with a conditional update, so a job two runners
 * race for runs once. SQLite has one writer, which makes this sufficient.
 */
export async function claimNextJob(now: Date): Promise<AutomationJob | null> {
  for (;;) {
    const candidate = await prisma.automationJob.findFirst({
      where: { status: { in: ["queued", "failed"] }, runAt: { lte: now } },
      orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return null;
    const { count } = await prisma.automationJob.updateMany({
      where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts },
      data: { status: "running", lockedAt: now, attempts: { increment: 1 } },
    });
    if (count === 1) return { ...candidate, status: "running", lockedAt: now, attempts: candidate.attempts + 1 };
  }
}

async function runJob(job: AutomationJob, handlers: JobHandlers, clock: () => Date): Promise<void> {
  // Every settle is conditional on the claim still holding: a job deleted
  // meanwhile (wipe-all) or recovered as stale must not be resurrected.
  const settle = (data: Prisma.AutomationJobUpdateManyMutationInput) =>
    prisma.automationJob.updateMany({ where: { id: job.id, status: "running", lockedAt: job.lockedAt }, data });
  try {
    const handler = handlers[job.kind];
    if (!handler) throw new PermanentJobError(`No handler for automation job kind "${job.kind}"`);
    await handler(job, { attempt: job.attempts, finalAttempt: job.attempts >= job.maxAttempts });
    await settle({ status: "done", lockedAt: null, finishedAt: clock(), lastError: null });
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    const now = clock();
    if (err instanceof PermanentJobError || job.attempts >= job.maxAttempts) {
      await settle({ status: "dead", lockedAt: null, finishedAt: now, lastError });
    } else {
      const backoff = RETRY_BACKOFF_MS[Math.min(job.attempts, RETRY_BACKOFF_MS.length) - 1];
      await settle({ status: "failed", lockedAt: null, lastError, runAt: new Date(now.getTime() + backoff) });
    }
    console.error(`[automation] ${job.kind} attempt ${job.attempts}/${job.maxAttempts} failed`, err);
  }
}

/**
 * Runs every job due by the clock, one at a time, until none is left. A failed
 * attempt is retried after RETRY_BACKOFF_MS; after maxAttempts, or on a
 * PermanentJobError, the job is dead and surfaces in the attention queue.
 */
export async function runDueJobs(handlers: JobHandlers, clock: () => Date = () => new Date()): Promise<number> {
  let ran = 0;
  for (let job = await claimNextJob(clock()); job; job = await claimNextJob(clock())) {
    await runJob(job, handlers, clock);
    ran++;
  }
  return ran;
}

/**
 * Returns jobs orphaned mid-run (the server died holding the lock) to the
 * queue. The interrupted attempt counts, so a job that kills the server every
 * time still ends dead instead of looping.
 */
export async function recoverStaleLocks(now: Date): Promise<number> {
  const stale = await prisma.automationJob.findMany({
    where: { status: "running", lockedAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
  });
  for (const job of stale) {
    const exhausted = job.attempts >= job.maxAttempts;
    await prisma.automationJob.updateMany({
      where: { id: job.id, status: "running", lockedAt: job.lockedAt },
      data: exhausted
        ? { status: "dead", lockedAt: null, finishedAt: now, lastError: INTERRUPTED }
        : { status: "queued", lockedAt: null, runAt: now, lastError: INTERRUPTED },
    });
  }
  return stale.length;
}
