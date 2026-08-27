import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { tailorResume } from "@/lib/apply/tailorResume";
import { renderResumeDocx } from "@/lib/apply/renderDocx";
import { runApplyAutomation } from "@/lib/apply/browserApply";
import { confirmApplicationSubmission } from "@/lib/apply/submission";

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

  // The browser workflow prepares a form for user review; it never clicks Submit.

  // Second factor beyond the CSRF/content-type guard + auth + the confirm
  // dialog UI (see components/ConfirmDialog.tsx / ApplyPanel.tsx) — this
  // endpoint fires a real, browser-driven submission.
  if (body.confirm !== "APPLY") {
    return NextResponse.json({ error: 'confirm: "APPLY" is required' }, { status: 400 });
  }
  if (typeof body.idempotencyKey !== "string" || !/^[a-z0-9-]{16,100}$/i.test(body.idempotencyKey)) {
    return NextResponse.json({ error: "a valid idempotencyKey is required" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!application.url) {
    return NextResponse.json({ error: "application has no URL to apply through" }, { status: 400 });
  }

  const duplicate = await prisma.applyRun.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
  if (duplicate) {
    if (duplicate.applicationId !== id) return NextResponse.json({ error: "idempotency key already used" }, { status: 409 });
    return NextResponse.json({ run: duplicate, idempotent: true });
  }
  const activeRun = await prisma.applyRun.findFirst({
    where: { applicationId: id, status: { in: ["pending", "review_required"] } },
    orderBy: { startedAt: "desc" },
  });
  if (activeRun) {
    return NextResponse.json({ error: "an apply run is already awaiting review", run: activeRun }, { status: 409 });
  }

  const run = await prisma.applyRun.create({ data: { applicationId: id, status: "pending", idempotencyKey: body.idempotencyKey } });

  try {
    const tailored = await tailorResume(id, userId);
    const resumePath = await renderResumeDocx(tailored, id, run.id);
    const result = await runApplyAutomation(id, resumePath, userId);

    const formAnswersSnapshot = result.formAnswersSnapshot ? JSON.stringify(result.formAnswersSnapshot) : null;
    if (result.status === "submitted" && result.submissionEvidence) {
      const confirmed = await confirmApplicationSubmission({
        applicationId: id,
        userId,
        applyRunId: run.id,
        evidence: result.submissionEvidence,
        runData: { tailoredResumePath: resumePath, formAnswersSnapshot, error: null },
      });
      return NextResponse.json({ run: confirmed.run, application: confirmed.application });
    }

    const submissionState =
      result.status === "review_required" || result.status === "needs_input" || result.status === "blocked" || result.status === "unknown"
        ? result.status
        : "failed";
    const [updated, updatedApplication] = await Promise.all([
      prisma.applyRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        tailoredResumePath: resumePath,
        formAnswersSnapshot,
        missingFieldKey: result.missingFieldKey ?? null,
        missingFieldLabel: result.missingFieldLabel ?? null,
        error: result.error ?? null,
        reviewedAt: result.status === "review_required" ? new Date() : null,
      },
      }),
      prisma.application.update({ where: { id }, data: { submissionState } }),
    ]);

    return NextResponse.json({ run: updated, application: updatedApplication });
  } catch (err) {
    const updated = await prisma.applyRun.update({
      where: { id: run.id },
      data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ run: updated }, { status: 500 });
  }
}
