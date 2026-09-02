import { prisma } from "@/lib/db/prisma";

const CLOSED_STATUSES = new Set(["Rejected", "Withdrawn"]);
const DAY_MS = 24 * 60 * 60 * 1000;

type MetricApplication = {
  id: string;
  source: string;
  status: string;
  appliedAt: Date | null;
  lastStatusChangeAt: Date;
};

type StatusTransition = {
  applicationId: string;
  to: string;
  at: Date;
};

export function calculatePipelineMetrics(
  applications: MetricApplication[],
  transitions: StatusTransition[],
  now = new Date(),
) {
  const transitionsByApplication = new Map<string, StatusTransition[]>();
  for (const transition of transitions) {
    const entries = transitionsByApplication.get(transition.applicationId) ?? [];
    entries.push(transition);
    transitionsByApplication.set(transition.applicationId, entries);
  }

  const reached = (application: MetricApplication, status: string) =>
    application.status === status || (transitionsByApplication.get(application.id) ?? []).some((entry) => entry.to === status);
  const submitted = applications.filter((application) => application.appliedAt !== null || reached(application, "Submitted"));
  const interviewed = applications.filter((application) => reached(application, "Interviewing") || reached(application, "Offer"));
  const offers = applications.filter((application) => reached(application, "Offer"));
  const activeStageDays = applications
    .filter((application) => !CLOSED_STATUSES.has(application.status))
    .map((application) => Math.max(0, Math.floor((now.getTime() - application.lastStatusChangeAt.getTime()) / DAY_MS)))
    .sort((a, b) => a - b);
  const midpoint = Math.floor(activeStageDays.length / 2);
  const medianCurrentStageDays = activeStageDays.length === 0
    ? 0
    : activeStageDays.length % 2 === 1
      ? activeStageDays[midpoint]
      : (activeStageDays[midpoint - 1] + activeStageDays[midpoint]) / 2;

  const sourceMap = new Map<string, { applications: number; interviews: number }>();
  for (const application of applications) {
    const source = sourceMap.get(application.source) ?? { applications: 0, interviews: 0 };
    source.applications += 1;
    if (interviewed.some((candidate) => candidate.id === application.id)) source.interviews += 1;
    sourceMap.set(application.source, source);
  }
  const sources = [...sourceMap.entries()]
    .map(([source, counts]) => ({
      source,
      ...counts,
      interviewRate: counts.applications === 0 ? 0 : Number(((counts.interviews / counts.applications) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.interviewRate - a.interviewRate || b.applications - a.applications || a.source.localeCompare(b.source));

  const percentage = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
  const weekAgo = now.getTime() - 7 * DAY_MS;

  return {
    funnel: { tracked: applications.length, submitted: submitted.length, interviewed: interviewed.length, offers: offers.length },
    submissionRate: percentage(submitted.length, applications.length),
    interviewRate: percentage(interviewed.length, submitted.length),
    offerRate: percentage(offers.length, interviewed.length),
    medianCurrentStageDays,
    weeklyStatusChanges: transitions.filter((transition) => transition.at.getTime() >= weekAgo).length,
    sources,
  };
}

export async function listPipelineMetrics(userId: string, now = new Date()) {
  const [applications, events] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      select: { id: true, source: true, status: true, appliedAt: true, lastStatusChangeAt: true },
    }),
    prisma.auditEvent.findMany({
      where: { userId, action: "application.status_changed", entityType: "Application" },
      select: { entityId: true, details: true, createdAt: true },
    }),
  ]);
  const transitions = events.flatMap((event) => {
    try {
      const details = JSON.parse(event.details ?? "{}") as { to?: unknown };
      return typeof details.to === "string" ? [{ applicationId: event.entityId, to: details.to, at: event.createdAt }] : [];
    } catch {
      return [];
    }
  });
  return calculatePipelineMetrics(applications, transitions, now);
}
