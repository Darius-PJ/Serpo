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
