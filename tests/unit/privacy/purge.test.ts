import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { keepApplication, purgeContactResearch, removeApplication, wipeAllData } from "@/lib/privacy/purge";
import { findOrCreateContact, linkContactToApplication, logInteraction } from "@/lib/contacts/contacts";

async function seedUserWithData(username: string) {
  const user = await prisma.user.create({ data: { username, passwordHash: "unused-in-this-test" } });
  const application = await prisma.application.create({
    data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
  });
  await prisma.resumeTemplate.create({
    data: { userId: user.id, sourceFilename: "resume.md", sourceFormat: "md", contentText: "..." },
  });
  await prisma.profileField.create({
    data: { userId: user.id, key: "email", label: "Email", value: `${username}@example.com` },
  });
  return { user, application };
}

describe("lib/privacy/purge", () => {
  it("wipeAllData deletes only the calling account's data, not other accounts' (regression: wipeAllData used to delete every account's applications)", async () => {
    const a = await seedUserWithData("purge-user-a");
    const b = await seedUserWithData("purge-user-b");

    const result = await wipeAllData(a.user.id);
    expect(result.applications).toBe(1);
    expect(result.resumeTemplates).toBe(1);
    expect(result.profileFields).toBe(1);

    const aApplications = await prisma.application.findMany({ where: { userId: a.user.id } });
    const bApplications = await prisma.application.findMany({ where: { userId: b.user.id } });
    const bResumeTemplates = await prisma.resumeTemplate.findMany({ where: { userId: b.user.id } });
    const bProfileFields = await prisma.profileField.findMany({ where: { userId: b.user.id } });

    expect(aApplications).toHaveLength(0);
    expect(bApplications).toHaveLength(1);
    expect(bResumeTemplates).toHaveLength(1);
    expect(bProfileFields).toHaveLength(1);
  });

  it("wipeAllData never touches curated (userId=null) job boards", async () => {
    const a = await seedUserWithData("purge-user-c");
    await prisma.jobBoard.create({
      data: { userId: null, name: "CalCareers", url: "https://www.calcareers.ca.gov", jurisdiction: "state", source: "curated" },
    });

    await wipeAllData(a.user.id);

    const curated = await prisma.jobBoard.findMany({ where: { userId: null } });
    expect(curated).toHaveLength(1);
  });

  it("wipeAllData also deletes account-scoped resume workspaces, reports, and saved board pins", async () => {
    const a = await seedUserWithData("purge-user-artifacts");
    const board = await prisma.jobBoard.create({
      data: { userId: null, name: "Shared board", url: "https://example.com", jurisdiction: "other", source: "curated" },
    });
    await prisma.jobBoardPin.create({ data: { userId: a.user.id, jobBoardId: board.id, pinned: true } });
    await prisma.resumeWorkspace.create({ data: { userId: a.user.id, benchmarkStatus: "not_started" } });
    const report = await prisma.raekwonReport.create({ data: { userId: a.user.id, batchSize: 5, keyword: "engineer" } });
    await prisma.raekwonLead.create({
      data: {
        reportId: report.id,
        company: "Acme",
        roleTitle: "Engineer",
        jobType: "Unknown",
        keyword: "engineer",
        rank: 1,
        explanation: "test",
        sourceUrl: "https://example.com/jobs/1",
      },
    });

    const result = await wipeAllData(a.user.id);

    expect(result.resumeWorkspaces).toBe(1);
    expect(result.raekwonReports).toBe(1);
    expect(result.jobBoardPins).toBe(1);
    await expect(prisma.resumeWorkspace.findMany({ where: { userId: a.user.id } })).resolves.toHaveLength(0);
    await expect(prisma.raekwonReport.findMany({ where: { userId: a.user.id } })).resolves.toHaveLength(0);
    await expect(prisma.jobBoardPin.findMany({ where: { userId: a.user.id } })).resolves.toHaveLength(0);
  });

  it("wipeAllData also deletes the account's contacts and interactions", async () => {
    const a = await seedUserWithData("purge-user-contacts-a");
    const b = await seedUserWithData("purge-user-contacts-b");
    const aContact = await findOrCreateContact(a.user.id, "Acme", { name: "Rina Patel" });
    await logInteraction(a.user.id, { contactId: aContact.id, kind: "email", direction: "outbound" });
    const bContact = await findOrCreateContact(b.user.id, "Acme", { name: "Sam Ruiz" });

    const result = await wipeAllData(a.user.id);

    expect(result.contacts).toBe(1);
    expect(result.interactions).toBe(1);
    await expect(prisma.contact.findMany({ where: { userId: a.user.id } })).resolves.toHaveLength(0);
    await expect(prisma.contact.findUnique({ where: { id: bContact.id } })).resolves.not.toBeNull();
  });

  it("purgeContactResearch removes this application's links but deletes only fully-orphaned contacts", async () => {
    const a = await seedUserWithData("purge-research-user");
    const second = await prisma.application.create({
      data: { userId: a.user.id, company: "Acme", role: "Analyst", source: "manual" },
    });

    const shared = await findOrCreateContact(a.user.id, "Acme", { name: "Shared Person" });
    await linkContactToApplication(shared.id, a.application.id, { sourceTool: "theharvester", confidence: null });
    await linkContactToApplication(shared.id, second.id, { sourceTool: "theharvester", confidence: null });
    const orphan = await findOrCreateContact(a.user.id, "Acme", { name: "Only Here" });
    await linkContactToApplication(orphan.id, a.application.id, { sourceTool: "theharvester", confidence: null });
    const withHistory = await findOrCreateContact(a.user.id, "Acme", { name: "Has History" });
    await linkContactToApplication(withHistory.id, a.application.id, { sourceTool: "theharvester", confidence: null });
    await logInteraction(a.user.id, { contactId: withHistory.id, kind: "note", direction: "outbound" });

    const result = await purgeContactResearch(a.application.id, a.user.id);

    expect(result.count).toBe(3);
    await expect(prisma.contactApplication.findMany({ where: { applicationId: a.application.id } })).resolves.toHaveLength(0);
    // Still linked elsewhere → survives; has logged history → survives; orphaned discovery → gone.
    await expect(prisma.contact.findUnique({ where: { id: shared.id } })).resolves.not.toBeNull();
    await expect(prisma.contact.findUnique({ where: { id: withHistory.id } })).resolves.not.toBeNull();
    await expect(prisma.contact.findUnique({ where: { id: orphan.id } })).resolves.toBeNull();
  });

  it("purgeContactResearch rejects a foreign application", async () => {
    const a = await seedUserWithData("purge-research-foreign-a");
    const b = await seedUserWithData("purge-research-foreign-b");

    await expect(purgeContactResearch(b.application.id, a.user.id)).rejects.toThrow("not found");
  });

  it("keepApplication rejects (throws) when the application belongs to a different account", async () => {
    const a = await seedUserWithData("purge-user-d");
    const b = await seedUserWithData("purge-user-e");

    await expect(keepApplication(b.application.id, a.user.id)).rejects.toThrow();
  });

  it("removeApplication rejects when the application belongs to a different account, and does not delete it", async () => {
    const a = await seedUserWithData("purge-user-f");
    const b = await seedUserWithData("purge-user-g");

    await expect(removeApplication(b.application.id, a.user.id)).rejects.toThrow();

    const stillThere = await prisma.application.findUnique({ where: { id: b.application.id } });
    expect(stillThere).not.toBeNull();
  });

  it("removeApplication succeeds for the owning account", async () => {
    const a = await seedUserWithData("purge-user-h");
    await removeApplication(a.application.id, a.user.id);
    const gone = await prisma.application.findUnique({ where: { id: a.application.id } });
    expect(gone).toBeNull();
  });
});
