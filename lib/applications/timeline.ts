import "server-only";
import { prisma } from "@/lib/db/prisma";
import { describeAuditAction } from "@/lib/dashboard/activity";

export type TimelineKind = "tracked" | "status" | "apply_run" | "message" | "interaction" | "task";

export interface TimelineEntry {
  /** Stable render key: source-prefixed row id (one row can yield two moments). */
  id: string;
  kind: TimelineKind;
  at: Date;
  label: string;
  detail: string | null;
}

/**
 * Phase 5's unified read model: one newest-first history for an application,
 * merging its tracked date, audit events (status changes, submission
 * confirmations), apply-run milestones, message drafts and sends,
 * application-linked interactions, and completed tasks. Pure read — no
 * schema, no writes. Returns null when the application isn't this user's.
 */
export async function listApplicationTimeline(userId: string, applicationId: string): Promise<TimelineEntry[] | null> {
  const application = await prisma.application.findUnique({
    where: { id_userId: { id: applicationId, userId } },
    select: { createdAt: true },
  });
  if (!application) return null;

  const [auditEvents, applyRuns, messages, interactions, completedTasks] = await Promise.all([
    prisma.auditEvent.findMany({ where: { userId, entityType: "Application", entityId: applicationId } }),
    prisma.applyRun.findMany({ where: { applicationId } }),
    prisma.message.findMany({ where: { applicationId } }),
    prisma.interaction.findMany({ where: { userId, applicationId } }),
    prisma.task.findMany({ where: { userId, applicationId, completedAt: { not: null } } }),
  ]);

  const entries: TimelineEntry[] = [
    {
      id: `tracked:${applicationId}`,
      kind: "tracked",
      at: application.createdAt,
      label: "Application tracked",
      detail: null,
    },
    ...auditEvents.map((event) => ({
      id: `audit:${event.id}`,
      kind: "status" as const,
      at: event.createdAt,
      label: describeAuditAction(event.action, event.details),
      detail: null,
    })),
    ...applyRuns.flatMap((run) => [
      {
        id: `apply-start:${run.id}`,
        kind: "apply_run" as const,
        at: run.startedAt,
        label: "Apply run started",
        detail: null,
      },
      ...(run.submittedAt
        ? [
            {
              id: `apply-submit:${run.id}`,
              kind: "apply_run" as const,
              at: run.submittedAt,
              label: "Apply run submitted",
              detail: null,
            },
          ]
        : []),
    ]),
    ...messages.flatMap((message) => {
      const noun = message.type === "FOLLOW_UP" ? "Follow-up" : "Outreach";
      return [
        {
          id: `message:${message.id}`,
          kind: "message" as const,
          at: message.createdAt,
          label: `${noun} draft created`,
          detail: null,
        },
        ...(message.sentAt
          ? [
              {
                id: `message-sent:${message.id}`,
                kind: "message" as const,
                at: message.sentAt,
                label: `${noun} sent`,
                detail: null,
              },
            ]
          : []),
      ];
    }),
    ...interactions.map((interaction) => ({
      id: `interaction:${interaction.id}`,
      kind: "interaction" as const,
      at: interaction.occurredAt,
      label: `Interaction: ${interaction.kind} (${interaction.direction})`,
      detail: interaction.notes,
    })),
    ...completedTasks.map((task) => ({
      id: `task:${task.id}`,
      kind: "task" as const,
      // The where clause filters on completedAt, so it is never null here.
      at: task.completedAt as Date,
      label: `Task completed: ${task.title}`,
      detail: null,
    })),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
