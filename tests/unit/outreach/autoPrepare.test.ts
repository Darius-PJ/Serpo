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

import { prepareOutreach } from "@/lib/outreach/autoPrepare";

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
});
