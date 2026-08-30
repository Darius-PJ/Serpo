import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { confirmApplicationSubmission, makeUserAttestationEvidence } from "@/lib/apply/submission";

describe("confirmed submission workflow", () => {
  it("records an attested submission on both the apply run and its owning application", async () => {
    const user = await prisma.user.create({ data: { username: "submission-owner", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual", submissionState: "review_required" },
    });
    const run = await prisma.applyRun.create({ data: { applicationId: application.id, status: "review_required" } });

    const result = await confirmApplicationSubmission({
      applicationId: application.id,
      userId: user.id,
      applyRunId: run.id,
      evidence: makeUserAttestationEvidence(),
    });

    expect(result.run.status).toBe("submitted");
    expect(JSON.parse(result.run.submissionEvidence ?? "{}").kind).toBe("user_attestation");
    expect(result.application.status).toBe("Submitted");
    expect(result.application.submissionState).toBe("confirmed");
    expect(result.application.submissionConfirmedAt).not.toBeNull();
  });

  it("records a status_changed audit event only when confirmation actually moves the application", async () => {
    const user = await prisma.user.create({ data: { username: "submission-status-audit", passwordHash: "unused" } });
    const moved = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual", submissionState: "review_required" },
    });
    const movedRun = await prisma.applyRun.create({ data: { applicationId: moved.id, status: "review_required" } });
    await confirmApplicationSubmission({
      applicationId: moved.id,
      userId: user.id,
      applyRunId: movedRun.id,
      evidence: makeUserAttestationEvidence(),
    });

    const alreadySubmitted = await prisma.application.create({
      data: {
        userId: user.id,
        company: "Beta",
        role: "Engineer",
        source: "manual",
        status: "Submitted",
        submissionState: "review_required",
      },
    });
    const secondRun = await prisma.applyRun.create({ data: { applicationId: alreadySubmitted.id, status: "review_required" } });
    await confirmApplicationSubmission({
      applicationId: alreadySubmitted.id,
      userId: user.id,
      applyRunId: secondRun.id,
      evidence: makeUserAttestationEvidence(),
    });

    const events = await prisma.auditEvent.findMany({
      where: { userId: user.id, action: "application.status_changed" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBe(moved.id);
    expect(JSON.parse(events[0].details ?? "{}")).toEqual({ from: "Sourced", to: "Submitted" });
  });

  it("does not let one account confirm another account's apply run", async () => {
    const owner = await prisma.user.create({ data: { username: "submission-owner-a", passwordHash: "unused" } });
    const other = await prisma.user.create({ data: { username: "submission-owner-b", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: owner.id, company: "Acme", role: "Engineer", source: "manual", submissionState: "review_required" },
    });
    const run = await prisma.applyRun.create({ data: { applicationId: application.id, status: "review_required" } });

    await expect(
      confirmApplicationSubmission({
        applicationId: application.id,
        userId: other.id,
        applyRunId: run.id,
        evidence: makeUserAttestationEvidence(),
      })
    ).rejects.toThrow("not found");

    await expect(prisma.applyRun.findUnique({ where: { id: run.id } })).resolves.toMatchObject({ status: "review_required" });
  });

  it("does not permit an attestation before the browser workflow is ready for review", async () => {
    const user = await prisma.user.create({ data: { username: "submission-pending", passwordHash: "unused" } });
    const application = await prisma.application.create({ data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" } });
    const run = await prisma.applyRun.create({ data: { applicationId: application.id, status: "pending" } });

    await expect(
      confirmApplicationSubmission({
        applicationId: application.id,
        userId: user.id,
        applyRunId: run.id,
        evidence: makeUserAttestationEvidence(),
      })
    ).rejects.toThrow("cannot be confirmed");
  });
});
