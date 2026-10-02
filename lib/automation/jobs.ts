import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";

export type AutomationJobKind = "saved_search.run" | "stale.scan" | "followup.scan" | "outreach.prepare";

export interface EnqueueJobInput {
  userId: string;
  kind: AutomationJobKind;
  /**
   * Unique across all jobs; enqueueing an existing key is a no-op. Saved
   * searches key by cadence slot, daily scans by local date, outreach by
   * application.
   */
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  runAt?: Date;
}

// Reset for a job that runs again from scratch: a user retry or a re-armed key.
const REQUEUED = { status: "queued", attempts: 0, lastError: null, lockedAt: null, finishedAt: null } as const;

/** The idempotency-key prefix shared by every run of one saved search; the slot's ISO time follows it. */
export function savedSearchJobKeyPrefix(savedSearchId: string): string {
  return `saved_search:${savedSearchId}:`;
}

/**
 * Inserts a job unless its idempotency key already exists. Returns true when
 * this call created it. With rearmFinished, an existing job that already
 * finished (done or dead) is queued again instead, so a fresh trigger for the
 * same key runs once more while a queued or running one is left alone.
 */
export async function enqueueJob(input: EnqueueJobInput, options: { rearmFinished?: boolean } = {}): Promise<boolean> {
  const runAt = input.runAt ?? new Date();
  try {
    await prisma.automationJob.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        payload: JSON.stringify(input.payload ?? {}),
        runAt,
      },
    });
    return true;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  if (options.rearmFinished) {
    const { count } = await prisma.automationJob.updateMany({
      where: { idempotencyKey: input.idempotencyKey, status: { in: ["done", "dead"] } },
      data: { ...REQUEUED, runAt },
    });
    return count > 0;
  }
  return false;
}

/** Queue a dead job for a fresh set of attempts. False when it isn't this user's dead job. */
export async function retryDeadJob(userId: string, jobId: string): Promise<boolean> {
  const { count } = await prisma.automationJob.updateMany({
    where: { id: jobId, userId, status: "dead" },
    data: { ...REQUEUED, runAt: new Date() },
  });
  return count > 0;
}

export function parseJobPayload(payload: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface FailedAutomation {
  jobId: string;
  kind: string;
  // Set for outreach preparation when the application still exists.
  applicationId: string | null;
  company: string | null;
  role: string | null;
  detail: string;
  since: Date;
}

const MAX_ERROR_LENGTH = 160;

/** This user's dead jobs, described for the attention queue. Jobs whose subject was deleted since are left out. */
export async function listFailedAutomation(userId: string): Promise<FailedAutomation[]> {
  const jobs = await prisma.automationJob.findMany({ where: { userId, status: "dead" }, orderBy: { finishedAt: "asc" } });
  if (jobs.length === 0) return [];

  // The one id each job's payload names, if any: an application or a saved search.
  const subjectIds = new Map(
    jobs.map((job) => {
      const payload = parseJobPayload(job.payload);
      const id = payload.applicationId ?? payload.savedSearchId;
      return [job.id, typeof id === "string" ? id : undefined];
    }),
  );
  const idsFor = (kind: AutomationJobKind) =>
    jobs.filter((job) => job.kind === kind).map((job) => subjectIds.get(job.id)).filter((id): id is string => id !== undefined);
  const [applications, searches] = await Promise.all([
    prisma.application.findMany({ where: { userId, id: { in: idsFor("outreach.prepare") } }, select: { id: true, company: true, role: true } }),
    prisma.savedSearch.findMany({ where: { userId, id: { in: idsFor("saved_search.run") } }, select: { id: true, name: true } }),
  ]);
  const applicationById = new Map(applications.map((application) => [application.id, application]));
  const searchNameById = new Map(searches.map((search) => [search.id, search.name]));

  return jobs.flatMap((job): FailedAutomation[] => {
    const subjectId = subjectIds.get(job.id) ?? "";
    const reason = job.lastError ? `: ${job.lastError.slice(0, MAX_ERROR_LENGTH)}` : "";
    const base = { jobId: job.id, kind: job.kind, applicationId: null, company: null, role: null, since: job.finishedAt ?? job.createdAt };
    switch (job.kind) {
      case "outreach.prepare": {
        const application = applicationById.get(subjectId);
        if (!application) return [];
        return [{ ...base, applicationId: application.id, company: application.company, role: application.role, detail: `Outreach preparation failed${reason}` }];
      }
      case "saved_search.run": {
        const name = searchNameById.get(subjectId);
        if (name === undefined) return [];
        return [{ ...base, detail: `Saved search "${name}" failed to run${reason}` }];
      }
      case "stale.scan":
        return [{ ...base, detail: `Stale-application scan failed${reason}` }];
      case "followup.scan":
        return [{ ...base, detail: `Follow-up drafting failed${reason}` }];
      default:
        return [{ ...base, detail: `Automation job ${job.kind} failed${reason}` }];
    }
  });
}
