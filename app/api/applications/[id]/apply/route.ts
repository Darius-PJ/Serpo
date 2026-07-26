import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { tailorResume } from "@/lib/apply/tailorResume";
import { renderResumeDocx } from "@/lib/apply/renderDocx";
import { runApplyAutomation } from "@/lib/apply/browserApply";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const runs = await prisma.applyRun.findMany({
    where: { applicationId: id },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ runs });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Second factor beyond the CSRF/content-type guard + auth + the confirm
  // dialog UI (see components/ConfirmDialog.tsx / ApplyPanel.tsx) — this
  // endpoint fires a real, browser-driven submission.
  if (body.confirm !== "APPLY") {
    return NextResponse.json({ error: 'confirm: "APPLY" is required' }, { status: 400 });
  }

  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!application.url) {
    return NextResponse.json({ error: "application has no URL to apply through" }, { status: 400 });
  }

  const run = await prisma.applyRun.create({ data: { applicationId: id, status: "pending" } });

  try {
    const tailored = await tailorResume(id, userId);
    const resumePath = await renderResumeDocx(tailored, id);
    const result = await runApplyAutomation(id, resumePath, userId);

    const updated = await prisma.applyRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        tailoredResumePath: resumePath,
        formAnswersSnapshot: result.formAnswersSnapshot ? JSON.stringify(result.formAnswersSnapshot) : null,
        missingFieldKey: result.missingFieldKey ?? null,
        missingFieldLabel: result.missingFieldLabel ?? null,
        error: result.error ?? null,
        submittedAt: result.status === "submitted" ? new Date() : null,
      },
    });

    return NextResponse.json({ run: updated });
  } catch (err) {
    const updated = await prisma.applyRun.update({
      where: { id: run.id },
      data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ run: updated }, { status: 500 });
  }
}
