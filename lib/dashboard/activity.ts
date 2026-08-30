import "server-only";
import { prisma } from "@/lib/db/prisma";

const ACTION_LABELS: Record<string, string> = {
  "application.submission_confirmed": "Submission confirmed",
};

/** Human label for an AuditEvent action; unknown actions render as recorded. */
export function describeAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export interface ActivityEntry {
  id: string;
  label: string;
  // "Company — Role" when the event's entity is one of this user's surviving
  // applications; null when the entity was deleted or isn't an application.
  subject: string | null;
  createdAt: Date;
}

/** The user's newest audit events, with application subjects resolved for display. */
export async function listRecentActivity(userId: string, limit = 10): Promise<ActivityEntry[]> {
  const events = await prisma.auditEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const applicationIds = [
    ...new Set(events.filter((event) => event.entityType === "Application").map((event) => event.entityId)),
  ];
  const applications = applicationIds.length
    ? await prisma.application.findMany({
        where: { id: { in: applicationIds }, userId },
        select: { id: true, company: true, role: true },
      })
    : [];
  const subjectById = new Map(applications.map((application) => [application.id, `${application.company} — ${application.role}`]));

  return events.map((event) => ({
    id: event.id,
    label: describeAuditAction(event.action),
    subject: event.entityType === "Application" ? (subjectById.get(event.entityId) ?? null) : null,
    createdAt: event.createdAt,
  }));
}
