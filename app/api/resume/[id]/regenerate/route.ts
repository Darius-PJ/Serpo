import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { generateBenchmarkResume } from "@/lib/resume/generateBenchmarkResume";
import { generateImprovedResume } from "@/lib/resume/generateImprovedResume";
import { generateMeldedResume, type MeldSourceInput } from "@/lib/resume/generateMeldedResume";
import type { BenchmarkResume } from "@/lib/resume/benchmarkResumeSchema";
import type { ImprovedResume } from "@/lib/resume/improvedResumeSchema";
import { serializeWorkspace } from "@/lib/resume/serializeWorkspace";
import { isResumeArtifact } from "@/lib/resume/artifact";
import { isMeldSource, MELD_SOURCE_LABELS, type MeldSource } from "@/lib/resume/meldSource";
import { resumeToPlainText } from "@/lib/resume/exportResume";

export const dynamic = "force-dynamic";

async function loadMeldSource(
  kind: MeldSource,
  userId: string,
  workspace: { improvedContent: string | null; improvedStatus: string; benchmarkContent: string | null; benchmarkStatus: string }
): Promise<MeldSourceInput | null> {
  if (kind === "reference") {
    const template = await prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    if (!template) return null;
    return { kind, label: MELD_SOURCE_LABELS[kind], text: template.contentText };
  }
  if (kind === "improved") {
    if (workspace.improvedStatus !== "generated" || !workspace.improvedContent) return null;
    return { kind, label: MELD_SOURCE_LABELS[kind], text: resumeToPlainText(JSON.parse(workspace.improvedContent) as ImprovedResume) };
  }
  if (workspace.benchmarkStatus !== "generated" || !workspace.benchmarkContent) return null;
  return { kind, label: MELD_SOURCE_LABELS[kind], text: resumeToPlainText(JSON.parse(workspace.benchmarkContent) as BenchmarkResume) };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const artifact = body.artifact;
  if (!isResumeArtifact(artifact)) {
    return NextResponse.json({ error: "artifact must be one of benchmark, improved, melded" }, { status: 400 });
  }

  const workspace = await prisma.resumeWorkspace.findUnique({ where: { id_userId: { id, userId } } });
  if (!workspace) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (artifact === "benchmark") {
    if (!workspace.company || !workspace.role) {
      return NextResponse.json({ error: "This workspace has no job posting to benchmark against." }, { status: 400 });
    }
    try {
      const content = await generateBenchmarkResume(workspace.company, workspace.role, workspace.jobDescription ?? undefined);
      const updated = await prisma.resumeWorkspace.update({
        where: { id },
        data: { benchmarkStatus: "generated", benchmarkContent: JSON.stringify(content), benchmarkError: null },
      });
      return NextResponse.json({ workspace: serializeWorkspace(updated) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await prisma.resumeWorkspace.update({
        where: { id },
        data: { benchmarkStatus: "failed", benchmarkError: message },
      });
      return NextResponse.json({ workspace: serializeWorkspace(updated) }, { status: 500 });
    }
  }

  if (artifact === "improved") {
    const template = await prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    if (!template) {
      return NextResponse.json({ error: "No resume uploaded yet." }, { status: 400 });
    }
    try {
      const content = await generateImprovedResume(
        template.contentText,
        workspace.company ?? undefined,
        workspace.role ?? undefined,
        workspace.jobDescription ?? undefined
      );
      const updated = await prisma.resumeWorkspace.update({
        where: { id },
        data: { improvedStatus: "generated", improvedContent: JSON.stringify(content), improvedError: null },
      });
      return NextResponse.json({ workspace: serializeWorkspace(updated) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await prisma.resumeWorkspace.update({
        where: { id },
        data: { improvedStatus: "failed", improvedError: message },
      });
      return NextResponse.json({ workspace: serializeWorkspace(updated) }, { status: 500 });
    }
  }

  // artifact === "melded"
  const meldSourceA = body.meldSourceA;
  const meldSourceB = body.meldSourceB;
  if (!isMeldSource(meldSourceA) || !isMeldSource(meldSourceB) || meldSourceA === meldSourceB) {
    return NextResponse.json({ error: "Choose two different resumes to meld." }, { status: 400 });
  }
  if (!workspace.company || !workspace.role) {
    return NextResponse.json({ error: "This workspace has no job posting to meld against." }, { status: 400 });
  }

  const [sourceA, sourceB] = await Promise.all([
    loadMeldSource(meldSourceA, userId, workspace),
    loadMeldSource(meldSourceB, userId, workspace),
  ]);
  if (!sourceA || !sourceB) {
    return NextResponse.json({ error: "One of the selected resumes isn't ready yet." }, { status: 400 });
  }

  try {
    const content = await generateMeldedResume(sourceA, sourceB, workspace.company, workspace.role);
    const updated = await prisma.resumeWorkspace.update({
      where: { id },
      data: { meldedStatus: "generated", meldedContent: JSON.stringify(content), meldedError: null, meldSourceA, meldSourceB },
    });
    return NextResponse.json({ workspace: serializeWorkspace(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await prisma.resumeWorkspace.update({
      where: { id },
      data: { meldedStatus: "failed", meldedError: message, meldSourceA, meldSourceB },
    });
    return NextResponse.json({ workspace: serializeWorkspace(updated) }, { status: 500 });
  }
}
