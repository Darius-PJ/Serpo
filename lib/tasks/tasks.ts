import "server-only";
import type { Task } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";

export interface CreateTaskInput {
  title: string;
  dueAt?: Date | null;
  applicationId?: string | null;
}

export type DueTask = Task & {
  application: { id: string; company: string; role: string } | null;
};

/**
 * Create a user task. Returns null when the title is blank or the linked
 * application belongs to someone else — a cross-account link must look the
 * same as a nonexistent one.
 */
export async function createTask(userId: string, input: CreateTaskInput): Promise<Task | null> {
  const title = input.title.trim();
  if (!title) return null;

  if (input.applicationId) {
    const owned = await prisma.application.findUnique({
      where: { id_userId: { id: input.applicationId, userId } },
      select: { id: true },
    });
    if (!owned) return null;
  }

  return prisma.task.create({
    data: { userId, title, dueAt: input.dueAt ?? null, applicationId: input.applicationId ?? null },
  });
}

/** Mark a task done. Idempotent — a completed task keeps its original time. */
export async function completeTask(userId: string, taskId: string): Promise<Task | null> {
  const existing = await prisma.task.findUnique({ where: { id_userId: { id: taskId, userId } } });
  if (!existing) return null;
  if (existing.completedAt) return existing;
  return prisma.task.update({ where: { id: taskId }, data: { completedAt: new Date() } });
}

/** Hide a task from the attention queue until the given time. */
export async function snoozeTask(userId: string, taskId: string, until: Date): Promise<Task | null> {
  const existing = await prisma.task.findUnique({ where: { id_userId: { id: taskId, userId } } });
  if (!existing) return null;
  return prisma.task.update({ where: { id: taskId }, data: { snoozedUntil: until } });
}

/**
 * All open (not completed) tasks, soonest due first with undated tasks last,
 * optionally scoped to one application. Snoozed tasks stay listed here — the
 * snooze only quiets the attention queue.
 */
export async function listOpenTasks(userId: string, applicationId?: string): Promise<Task[]> {
  return prisma.task.findMany({
    where: { userId, completedAt: null, ...(applicationId ? { applicationId } : {}) },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

/**
 * The tasks that belong in the attention queue right now: open, not snoozed
 * past `now`, and either undated or due by `now`. Application context comes
 * along for display.
 */
export async function listDueTasks(userId: string, now: Date): Promise<DueTask[]> {
  return prisma.task.findMany({
    where: {
      userId,
      completedAt: null,
      OR: [{ dueAt: null }, { dueAt: { lte: now } }],
      AND: { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
    },
    include: { application: { select: { id: true, company: true, role: true } } },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}
