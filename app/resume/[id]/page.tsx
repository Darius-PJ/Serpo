import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { ResumeWorkspaceView } from "@/components/ResumeWorkspaceView";
import { serializeWorkspace } from "@/lib/resume/serializeWorkspace";

export const dynamic = "force-dynamic";

export default async function ResumeWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserIdForPage();
  const { id } = await params;

  const [workspace, template] = await Promise.all([
    prisma.resumeWorkspace.findUnique({ where: { id_userId: { id, userId } } }),
    prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!workspace) notFound();

  return <ResumeWorkspaceView workspace={serializeWorkspace(workspace)} initialTemplateText={template?.contentText ?? null} />;
}
