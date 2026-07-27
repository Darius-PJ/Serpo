import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { ResumeWorkspaceView } from "@/components/ResumeWorkspaceView";
import { serializeWorkspace } from "@/lib/resume/serializeWorkspace";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const userId = await requireUserIdForPage();

  const [workspace, template] = await Promise.all([
    prisma.resumeWorkspace.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!workspace) {
    return (
      <div className="card-soft p-6 text-center">
        <p className="mb-3 text-sm text-foreground-muted">
          No resumes yet. Search for a job and click &quot;Resume&quot; on a result to get started.
        </p>
        <Link href="/sourcing" className="btn-primary inline-block px-4 py-2 text-sm">
          Go to Source Jobs
        </Link>
      </div>
    );
  }

  return <ResumeWorkspaceView workspace={serializeWorkspace(workspace)} hasResumeTemplate={Boolean(template)} />;
}
