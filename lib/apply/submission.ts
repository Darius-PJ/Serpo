import "server-only";
import { prisma } from "@/lib/db/prisma";

export interface SubmissionEvidence {
  kind: "detected_confirmation" | "user_attestation";
  recordedAt: string;
  finalUrl?: string;
  signal?: string;
}

export async function confirmApplicationSubmission({
  applicationId,
  userId,
  applyRunId,
  evidence,
  runData,
}: {
  applicationId: string;
  userId: string;
  applyRunId: string;
  evidence: SubmissionEvidence;
  runData?: { tailoredResumePath?: string | null; formAnswersSnapshot?: string | null; error?: string | null };
}) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({ where: { id_userId: { id: applicationId, userId } } });
    if (!application) throw new Error("not found");

    const run = await tx.applyRun.findFirst({ where: { id: applyRunId, applicationId } });
    if (!run) throw new Error("apply run not found");

    if (run.status === "submitted") {
      return { run, application };
    }
    const confirmableStatuses = evidence.kind === "detected_confirmation" ? ["pending"] : ["review_required", "unknown"];
    if (!confirmableStatuses.includes(run.status)) {
      throw new Error("apply run cannot be confirmed in its current state");
    }

    const now = new Date();
    const updatedRun = await tx.applyRun.update({
      where: { id: run.id },
      data: {
        status: "submitted",
        reviewedAt: now,
        submittedAt: now,
        submissionEvidence: JSON.stringify(evidence),
        ...(runData?.tailoredResumePath !== undefined ? { tailoredResumePath: runData.tailoredResumePath } : {}),
        ...(runData?.formAnswersSnapshot !== undefined ? { formAnswersSnapshot: runData.formAnswersSnapshot } : {}),
        ...(runData?.error !== undefined ? { error: runData.error } : {}),
      },
    });
    const updatedApplication = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "Submitted",
        appliedAt: application.appliedAt ?? now,
        submissionState: "confirmed",
        submissionConfirmedAt: application.submissionConfirmedAt ?? now,
      },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "application.submission_confirmed",
        entityType: "Application",
        entityId: applicationId,
        details: JSON.stringify({ applyRunId, evidenceKind: evidence.kind }),
      },
    });
    // Confirmation is also a pipeline stage move when it changes the status —
    // funnel metrics read status_changed events, whichever path caused them.
    if (application.status !== "Submitted") {
      await tx.auditEvent.create({
        data: {
          userId,
          action: "application.status_changed",
          entityType: "Application",
          entityId: applicationId,
          details: JSON.stringify({ from: application.status, to: "Submitted" }),
        },
      });
    }
    return { run: updatedRun, application: updatedApplication };
  });
}

export function makeUserAttestationEvidence(): SubmissionEvidence {
  return { kind: "user_attestation", recordedAt: new Date().toISOString(), signal: "User confirmed submitting the application." };
}
