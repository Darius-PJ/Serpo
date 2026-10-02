import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { findOrCreateContact, linkContactToApplication } from "@/lib/contacts/contacts";

const researchAllToolsMock = vi.hoisted(() => vi.fn());
const configuredOsintConnectorsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/osint", () => ({
  researchAllTools: researchAllToolsMock,
  configuredOsintConnectors: configuredOsintConnectorsMock,
}));

const generateMessageMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/generateMessage", () => ({ generateMessage: generateMessageMock }));

import { prepareOutreach, queueOutreachPreparation } from "@/lib/outreach/autoPrepare";
import { JOB_HANDLERS } from "@/lib/automation/handlers";
import { runDueJobs } from "@/lib/automation/runner";

let seq = 0;
async function makeApplication() {
  seq++;
  const user = await prisma.user.create({ data: { username: `outreach-user-${seq}`, passwordHash: "unused" } });
  const application = await prisma.application.create({
    data: { userId: user.id, company: `Acme ${seq}`, role: "Engineer", source: "manual" },
  });
  return { user, application };
}

function auditEvents(userId: string, applicationId: string) {
  return prisma.auditEvent.findMany({
    where: { userId, entityId: applicationId, action: { in: ["application.outreach_prepared", "application.outreach_failed"] } },
  });
}

describe("prepareOutreach", () => {
  beforeEach(() => {
    researchAllToolsMock.mockReset();
    configuredOsintConnectorsMock.mockReset();
    generateMessageMock.mockReset();
    vi.unstubAllEnvs();
    configuredOsintConnectorsMock.mockReturnValue([{}]);
    vi.stubEnv("ENABLE_AI_ASSISTANCE", "true");
  });

  it("discovers by company name, links the contacts, drafts, and records the audit event", async () => {
    const { user, application } = await makeApplication();
    researchAllToolsMock.mockResolvedValue([
      {
        tool: "hunter",
        label: "Hunter.io",
        results: [
          { name: "Jordan Reyes", title: "Engineering Manager", email: "jordan@acme.test", sourceTool: "hunter", confidence: "hunter-confidence-93" },
          { email: "info@acme.test", sourceTool: "hunter" },
        ],
      },
    ]);
    generateMessageMock.mockResolvedValue({ id: "draft-1" });

    await prepareOutreach(user.id, application.id);

    expect(researchAllToolsMock).toHaveBeenCalledWith({ company: application.company });
    const links = await prisma.contactApplication.findMany({ where: { applicationId: application.id } });
    expect(links).toHaveLength(2);
    expect(generateMessageMock).toHaveBeenCalledWith(application.id, "IMMEDIATE");
    const events = await auditEvents(user.id, application.id);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].details!)).toMatchObject({ contactsLinked: 2, draftId: "draft-1" });
  });

  it("is idempotent: an existing IMMEDIATE draft short-circuits everything", async () => {
    const { user, application } = await makeApplication();
    await prisma.message.create({
      data: { applicationId: application.id, type: "IMMEDIATE", draftText: "already drafted", status: "DRAFT" },
    });

    await prepareOutreach(user.id, application.id);

    expect(researchAllToolsMock).not.toHaveBeenCalled();
    expect(generateMessageMock).not.toHaveBeenCalled();
    await expect(auditEvents(user.id, application.id)).resolves.toHaveLength(0);
  });

  it("links contacts without drafting when AI assistance is off", async () => {
    const { user, application } = await makeApplication();
    vi.stubEnv("ENABLE_AI_ASSISTANCE", "false");
    researchAllToolsMock.mockResolvedValue([
      { tool: "hunter", label: "Hunter.io", results: [{ name: "Jordan Reyes", sourceTool: "hunter" }] },
    ]);

    await prepareOutreach(user.id, application.id);

    expect(generateMessageMock).not.toHaveBeenCalled();
    const events = await auditEvents(user.id, application.id);
    expect(JSON.parse(events[0].details!)).toMatchObject({ contactsLinked: 1, draftId: null });
  });

  it("drafts without discovery when no OSINT connector is configured", async () => {
    const { user, application } = await makeApplication();
    configuredOsintConnectorsMock.mockReturnValue([]);
    generateMessageMock.mockResolvedValue({ id: "draft-2" });

    await prepareOutreach(user.id, application.id);

    expect(researchAllToolsMock).not.toHaveBeenCalled();
    const events = await auditEvents(user.id, application.id);
    expect(JSON.parse(events[0].details!)).toMatchObject({ contactsLinked: 0, draftId: "draft-2" });
  });

  it("does nothing at all when neither discovery nor AI is available", async () => {
    const { user, application } = await makeApplication();
    configuredOsintConnectorsMock.mockReturnValue([]);
    vi.stubEnv("ENABLE_AI_ASSISTANCE", "false");

    await prepareOutreach(user.id, application.id);

    await expect(auditEvents(user.id, application.id)).resolves.toHaveLength(0);
  });

  it("skips re-discovery when the application already has linked contacts, but still drafts", async () => {
    const { user, application } = await makeApplication();
    const contact = await findOrCreateContact(user.id, application.company, { name: "Curated Person" });
    await linkContactToApplication(contact.id, application.id, { sourceTool: "manual", confidence: null });
    generateMessageMock.mockResolvedValue({ id: "draft-3" });

    await prepareOutreach(user.id, application.id);

    expect(researchAllToolsMock).not.toHaveBeenCalled();
    const events = await auditEvents(user.id, application.id);
    expect(JSON.parse(events[0].details!)).toMatchObject({ contactsLinked: 0, draftId: "draft-3" });
  });

  it("contains failures: a discovery crash records outreach_failed and never throws", async () => {
    const { user, application } = await makeApplication();
    researchAllToolsMock.mockRejectedValue(new Error("Hunter.io domain search failed: HTTP 429"));

    await expect(prepareOutreach(user.id, application.id)).resolves.toBeUndefined();

    const events = await auditEvents(user.id, application.id);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("application.outreach_failed");
    expect(JSON.parse(events[0].details!).error).toMatch(/429/);
  });

  it("rethrows a retryable failure for the runner, recording it only on the final attempt", async () => {
    const { user, application } = await makeApplication();
    configuredOsintConnectorsMock.mockReturnValue([]);
    const unavailable = Object.assign(new Error("503 Service Unavailable"), { status: 503 });
    generateMessageMock.mockRejectedValue(unavailable);

    await expect(prepareOutreach(user.id, application.id, { finalAttempt: false })).rejects.toBe(unavailable);
    await expect(auditEvents(user.id, application.id)).resolves.toHaveLength(0);

    await expect(prepareOutreach(user.id, application.id, { finalAttempt: true })).rejects.toBe(unavailable);
    const events = await auditEvents(user.id, application.id);
    expect(events.map((event) => event.action)).toEqual(["application.outreach_failed"]);
  });

  it("records a failure no retry can fix on the first attempt, without throwing", async () => {
    const { user, application } = await makeApplication();
    configuredOsintConnectorsMock.mockReturnValue([]);
    generateMessageMock.mockRejectedValue(Object.assign(new Error("400 prompt too long"), { status: 400 }));

    await expect(prepareOutreach(user.id, application.id, { finalAttempt: false })).resolves.toBeUndefined();

    const events = await auditEvents(user.id, application.id);
    expect(events.map((event) => event.action)).toEqual(["application.outreach_failed"]);
  });
});

describe("queueOutreachPreparation", () => {
  beforeEach(() => {
    configuredOsintConnectorsMock.mockReset().mockReturnValue([]);
    generateMessageMock.mockReset().mockResolvedValue({ id: "queued-draft" });
    vi.stubEnv("ENABLE_AI_ASSISTANCE", "true");
  });

  it("queues one preparation job per application, which the runner carries out, and re-arms it once it finished", async () => {
    const { user, application } = await makeApplication();

    await queueOutreachPreparation(user.id, application.id);
    await queueOutreachPreparation(user.id, application.id);
    const [job, ...duplicates] = await prisma.automationJob.findMany({ where: { userId: user.id } });
    expect(duplicates).toEqual([]);
    expect(job).toMatchObject({ kind: "outreach.prepare", status: "queued" });

    await expect(runDueJobs(JOB_HANDLERS)).resolves.toBe(1);
    expect(generateMessageMock).toHaveBeenCalledWith(application.id, "IMMEDIATE");
    await expect(auditEvents(user.id, application.id)).resolves.toMatchObject([{ action: "application.outreach_prepared" }]);

    // Moved back into Submitted later: the finished job is queued again.
    await queueOutreachPreparation(user.id, application.id);
    await expect(prisma.automationJob.findMany({ where: { userId: user.id } })).resolves.toMatchObject([
      { id: job.id, status: "queued", attempts: 0 },
    ]);
  });
});
