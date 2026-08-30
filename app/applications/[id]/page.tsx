import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { StatusSelect } from "@/components/StatusSelect";
import { ContactPanel } from "@/components/ContactPanel";
import { MessagePanel } from "@/components/MessagePanel";
import { ApplyPanel } from "@/components/ApplyPanel";
import { TaskQuickAdd } from "@/components/TaskQuickAdd";
import { TaskActions } from "@/components/TaskActions";
import { isFollowUpDue } from "@/lib/scheduler/followUpCheck";
import { listOpenTasks } from "@/lib/tasks/tasks";
import { listContactsForApplication } from "@/lib/contacts/contacts";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserIdForPage();
  const { id } = await params;
  const [application, resumeTemplate, applyRuns, contactLinks] = await Promise.all([
    prisma.application.findUnique({
      where: { id_userId: { id, userId } },
      include: { messages: { orderBy: { createdAt: "desc" } } },
    }),
    prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.applyRun.findMany({ where: { applicationId: id }, orderBy: { startedAt: "desc" } }),
    listContactsForApplication(userId, id),
  ]);
  const tasks = await listOpenTasks(userId, id);

  if (!application) notFound();

  return (
    <div>
      <Link href="/pipeline" className="mb-3 inline-flex text-sm text-primary-dark underline">
        Back to pipeline
      </Link>
      <div className="card-soft mb-6 p-4">
        <h1 className="text-xl font-extrabold text-foreground">
          {application.role} <span className="font-medium text-foreground-muted">at {application.company}</span>
        </h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-foreground-muted">
          <StatusSelect
            applicationId={application.id}
            status={application.status}
            label={`Status for ${application.company} — ${application.role}`}
          />
          {application.url && (
            <a href={application.url} target="_blank" rel="noopener noreferrer" className="text-primary-dark underline">
              Original posting
            </a>
          )}
          <span>Source: {application.source}</span>
        </div>
        {application.appliedAt && (
          <p className="mt-1 text-xs text-foreground-muted">
            Applied {application.appliedAt.toLocaleDateString()}
          </p>
        )}
      </div>

      <section aria-labelledby="application-tasks" className="card-soft mb-6 p-4">
        <h2 id="application-tasks" className="mb-2 text-sm font-bold text-primary-dark">
          Tasks
        </h2>
        {tasks.length === 0 ? (
          <p className="mb-3 text-sm text-foreground-muted">No open tasks.</p>
        ) : (
          <ul className="mb-3 divide-y divide-border-soft">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-foreground">{task.title}</span>
                  {task.dueAt && (
                    <span className="text-foreground-muted"> — due {task.dueAt.toLocaleDateString()}</span>
                  )}
                </span>
                <TaskActions taskId={task.id} title={task.title} showSnooze={false} />
              </li>
            ))}
          </ul>
        )}
        <TaskQuickAdd applicationId={application.id} />
      </section>

      <ContactPanel applicationId={application.id} company={application.company} links={contactLinks} />
      <ApplyPanel
        applicationId={application.id}
        company={application.company}
        role={application.role}
        hasResumeTemplate={Boolean(resumeTemplate)}
        runs={applyRuns}
      />
      <MessagePanel
        applicationId={application.id}
        messages={application.messages}
        submissionConfirmed={application.submissionState === "confirmed"}
        followUpDue={isFollowUpDue(application)}
      />
    </div>
  );
}
