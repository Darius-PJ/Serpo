import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  findOrCreateContact,
  linkContactToApplication,
  listContactsByCompany,
  listContactsForApplication,
  logInteraction,
} from "@/lib/contacts/contacts";

describe("findOrCreateContact", () => {
  it("merges on case-insensitive name within the same user and company, backfilling missing fields", async () => {
    const user = await prisma.user.create({ data: { username: "contact-merge-user", passwordHash: "unused" } });

    const first = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel" });
    const second = await findOrCreateContact(user.id, "Acme", {
      name: "rina patel",
      title: "Recruiter",
      email: "rina@acme.example",
    });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ title: "Recruiter", email: "rina@acme.example" });
    // Backfill fills gaps only — an existing value is never overwritten.
    const third = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel", email: "other@acme.example" });
    expect(third.email).toBe("rina@acme.example");
    await expect(prisma.contact.count({ where: { userId: user.id } })).resolves.toBe(1);
  });

  it("keeps different companies, different users, and nameless discoveries separate", async () => {
    const user = await prisma.user.create({ data: { username: "contact-separate-user", passwordHash: "unused" } });
    const other = await prisma.user.create({ data: { username: "contact-separate-other", passwordHash: "unused" } });

    const acme = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel" });
    const beta = await findOrCreateContact(user.id, "Beta", { name: "Rina Patel" });
    const foreign = await findOrCreateContact(other.id, "Acme", { name: "Rina Patel" });
    const namelessA = await findOrCreateContact(user.id, "Acme", { email: "info@acme.example" });
    const namelessB = await findOrCreateContact(user.id, "Acme", { email: "info@acme.example" });

    const distinct = new Set([acme.id, beta.id, foreign.id, namelessA.id, namelessB.id]);
    expect(distinct.size).toBe(5);
  });
});

describe("linkContactToApplication", () => {
  it("links once per application, keeping the first discovery's provenance", async () => {
    const user = await prisma.user.create({ data: { username: "contact-link-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const contact = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel" });

    const link = await linkContactToApplication(contact.id, application.id, { sourceTool: "hunter", confidence: "high" });
    const repeat = await linkContactToApplication(contact.id, application.id, { sourceTool: "other-tool", confidence: null });

    expect(repeat.id).toBe(link.id);
    expect(repeat).toMatchObject({ sourceTool: "hunter", confidence: "high" });
  });
});

describe("listContactsForApplication", () => {
  it("returns this application's linked contacts with provenance, scoped to the owner", async () => {
    const user = await prisma.user.create({ data: { username: "contact-list-app-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const contact = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel", title: "Recruiter" });
    await linkContactToApplication(contact.id, application.id, { sourceTool: "hunter", confidence: null });

    const links = await listContactsForApplication(user.id, application.id);
    expect(links).toHaveLength(1);
    expect(links[0].contact).toMatchObject({ name: "Rina Patel", title: "Recruiter" });
    expect(links[0].sourceTool).toBe("hunter");

    const intruder = await prisma.user.create({ data: { username: "contact-list-app-intruder", passwordHash: "unused" } });
    await expect(listContactsForApplication(intruder.id, application.id)).resolves.toEqual([]);
  });
});

describe("logInteraction", () => {
  it("logs a typed interaction against an owned contact and rejects foreign contacts and bad types", async () => {
    const user = await prisma.user.create({ data: { username: "interaction-user", passwordHash: "unused" } });
    const contact = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel" });
    const occurredAt = new Date("2026-08-20T10:00:00");

    const logged = await logInteraction(user.id, {
      contactId: contact.id,
      kind: "email",
      direction: "outbound",
      occurredAt,
      notes: "Sent intro note",
    });
    expect(logged).toMatchObject({ kind: "email", direction: "outbound", notes: "Sent intro note" });
    expect(logged?.occurredAt).toEqual(occurredAt);

    const intruder = await prisma.user.create({ data: { username: "interaction-intruder", passwordHash: "unused" } });
    await expect(
      logInteraction(intruder.id, { contactId: contact.id, kind: "call", direction: "inbound" }),
    ).resolves.toBeNull();
    await expect(
      logInteraction(user.id, { contactId: contact.id, kind: "carrier-pigeon", direction: "outbound" }),
    ).resolves.toBeNull();
    await expect(
      logInteraction(user.id, { contactId: contact.id, kind: "email", direction: "sideways" }),
    ).resolves.toBeNull();
    await expect(prisma.interaction.count({ where: { contactId: contact.id } })).resolves.toBe(1);
  });

  it("optionally ties the interaction to an owned application, rejecting foreign ones", async () => {
    const user = await prisma.user.create({ data: { username: "interaction-app-user", passwordHash: "unused" } });
    const other = await prisma.user.create({ data: { username: "interaction-app-other", passwordHash: "unused" } });
    const contact = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel" });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const foreign = await prisma.application.create({
      data: { userId: other.id, company: "Hidden", role: "Engineer", source: "manual" },
    });

    const logged = await logInteraction(user.id, {
      contactId: contact.id,
      kind: "call",
      direction: "inbound",
      applicationId: application.id,
    });
    expect(logged?.applicationId).toBe(application.id);

    await expect(
      logInteraction(user.id, { contactId: contact.id, kind: "call", direction: "inbound", applicationId: foreign.id }),
    ).resolves.toBeNull();
  });
});

describe("listContactsByCompany", () => {
  it("groups this user's contacts by company with linked applications and newest-first interactions", async () => {
    const user = await prisma.user.create({ data: { username: "contact-group-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Beta", role: "Analyst", source: "manual" },
    });

    const beta = await findOrCreateContact(user.id, "Beta", { name: "Sam Ruiz" });
    await findOrCreateContact(user.id, "Acme", { name: "Rina Patel" });
    await linkContactToApplication(beta.id, application.id, { sourceTool: "manual", confidence: null });
    await logInteraction(user.id, { contactId: beta.id, kind: "email", direction: "outbound", occurredAt: new Date("2026-08-01T09:00:00") });
    await logInteraction(user.id, { contactId: beta.id, kind: "call", direction: "inbound", occurredAt: new Date("2026-08-15T09:00:00") });

    const other = await prisma.user.create({ data: { username: "contact-group-other", passwordHash: "unused" } });
    await findOrCreateContact(other.id, "Acme", { name: "Hidden Person" });

    const groups = await listContactsByCompany(user.id);

    expect(groups.map((group) => group.company)).toEqual(["Acme", "Beta"]);
    expect(groups[1].contacts[0].name).toBe("Sam Ruiz");
    expect(groups[1].contacts[0].applications.map((a) => a.role)).toEqual(["Analyst"]);
    expect(groups[1].contacts[0].interactions.map((entry) => entry.kind)).toEqual(["call", "email"]);
  });
});
