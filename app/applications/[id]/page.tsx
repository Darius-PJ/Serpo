import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { StatusSelect } from "@/components/StatusSelect";
import { DecisionMakerPanel } from "@/components/DecisionMakerPanel";
import { MessagePanel } from "@/components/MessagePanel";
import { ApplyPanel } from "@/components/ApplyPanel";
import { isFollowUpDue } from "@/lib/scheduler/followUpCheck";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserIdForPage();
  const { id } = await params;
  const [application, resumeTemplate, applyRuns] = await Promise.all([
    prisma.application.findUnique({
      where: { id_userId: { id, userId } },
      include: { decisionMakers: true, messages: { orderBy: { createdAt: "desc" } } },
    }),
    prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.applyRun.findMany({ where: { applicationId: id }, orderBy: { startedAt: "desc" } }),
  ]);

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

      <DecisionMakerPanel
        applicationId={application.id}
        company={application.company}
        decisionMakers={application.decisionMakers}
      />
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
