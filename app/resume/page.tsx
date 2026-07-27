import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { ResumeWorkspaceView } from "@/components/ResumeWorkspaceView";
import { serializeWorkspace } from "@/lib/resume/serializeWorkspace";

export const dynamic = "force-dynamic";

// The Resume tab's default landing state — not tied to any job posting, so
// it always shows only the Improved workflow (see ResumeWorkspaceView's
// isGeneral check). A job-targeted workspace (company/role set) is only
// ever reached via the "Resume" button on a search result, landing on
// /resume/[id] directly — never shown here. "Start fresh" on a job-targeted
// workspace just links back here.
export default async function ResumePage() {
  const userId = await requireUserIdForPage();

  let workspace = await prisma.resumeWorkspace.findFirst({
    where: { userId, company: null },
    orderBy: { createdAt: "desc" },
  });

  if (!workspace) {
    workspace = await prisma.resumeWorkspace.create({
      data: { userId, benchmarkStatus: "not_started" },
    });
  }

  const template = await prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });

  return <ResumeWorkspaceView workspace={serializeWorkspace(workspace)} hasResumeTemplate={Boolean(template)} />;
}
