import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { StatusSelect } from "@/components/StatusSelect";
import { DecisionMakerPanel } from "@/components/DecisionMakerPanel";
import { MessagePanel } from "@/components/MessagePanel";
import { ApplyPanel } from "@/components/ApplyPanel";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [application, resumeTemplate, applyRuns] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      include: { decisionMakers: true, messages: { orderBy: { createdAt: "desc" } } },
    }),
    prisma.resumeTemplate.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.applyRun.findMany({ where: { applicationId: id }, orderBy: { startedAt: "desc" } }),
  ]);

  if (!application) notFound();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">
          {application.role} <span className="text-neutral-500">at {application.company}</span>
        </h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-neutral-600">
          <StatusSelect applicationId={application.id} status={application.status} />
          {application.url && (
            <a href={application.url} target="_blank" rel="noopener noreferrer" className="underline">
              Original posting
            </a>
          )}
          <span>Source: {application.source}</span>
        </div>
        {application.appliedAt && (
          <p className="mt-1 text-xs text-neutral-500">
            Applied {application.appliedAt.toLocaleDateString()}
          </p>
        )}
      </div>

      <DecisionMakerPanel applicationId={application.id} decisionMakers={application.decisionMakers} />
      <ApplyPanel applicationId={application.id} hasResumeTemplate={Boolean(resumeTemplate)} runs={applyRuns} />
      <MessagePanel applicationId={application.id} messages={application.messages} />
    </div>
  );
}
