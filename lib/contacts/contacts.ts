import "server-only";
import type { Contact, ContactApplication, Interaction } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { isInteractionDirection, isInteractionKind } from "@/lib/contacts/types";

export interface DiscoveredContact {
  name?: string | null;
  title?: string | null;
  email?: string | null;
}

export interface LogInteractionInput {
  contactId: string;
  kind: string;
  direction: string;
  occurredAt?: Date;
  notes?: string | null;
  applicationId?: string | null;
}

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/**
 * The one write path for contact identity, applying the user-approved merge
 * policy at runtime exactly as the migration applied it to history: reuse the
 * contact with the same case-insensitive name at the same company for this
 * user; nameless discoveries always create a fresh record. A reused contact
 * gets missing title/email backfilled — existing values are never overwritten.
 */
export async function findOrCreateContact(userId: string, company: string, input: DiscoveredContact): Promise<Contact> {
  const name = normalizeName(input.name);
  const title = input.title?.trim() || null;
  const email = input.email?.trim() || null;
  const normalizedCompany = company.trim();

  if (name) {
    // Contacts at one company are few; matching in JS keeps the comparison
    // case-insensitive without a normalized shadow column.
    const candidates = await prisma.contact.findMany({ where: { userId, company: normalizedCompany } });
    const existing = candidates.find((candidate) => candidate.name?.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      const backfill = {
        ...(existing.title === null && title ? { title } : {}),
        ...(existing.email === null && email ? { email } : {}),
      };
      if (Object.keys(backfill).length === 0) return existing;
      return prisma.contact.update({ where: { id: existing.id }, data: backfill });
    }
  }

  return prisma.contact.create({ data: { userId, company: normalizedCompany, name, title, email } });
}

/** Attach a contact to an application, keeping the first discovery's provenance on repeats. */
export async function linkContactToApplication(
  contactId: string,
  applicationId: string,
  provenance: { sourceTool: string; confidence: string | null },
): Promise<ContactApplication> {
  return prisma.contactApplication.upsert({
    where: { contactId_applicationId: { contactId, applicationId } },
    update: {},
    create: { contactId, applicationId, sourceTool: provenance.sourceTool, confidence: provenance.confidence },
  });
}

/** This application's contact links (with contacts), newest discovery first, scoped to the owner. */
export async function listContactsForApplication(userId: string, applicationId: string) {
  return prisma.contactApplication.findMany({
    where: { applicationId, contact: { userId } },
    include: { contact: true },
    orderBy: { foundAt: "desc" },
  });
}

/**
 * Log one touch with a contact. Returns null when the contact (or the
 * optional application) isn't this user's, or the kind/direction is unknown —
 * cross-account requests must look like nonexistent records.
 */
export async function logInteraction(userId: string, input: LogInteractionInput): Promise<Interaction | null> {
  if (!isInteractionKind(input.kind) || !isInteractionDirection(input.direction)) return null;

  const contact = await prisma.contact.findUnique({
    where: { id_userId: { id: input.contactId, userId } },
    select: { id: true },
  });
  if (!contact) return null;

  if (input.applicationId) {
    const application = await prisma.application.findUnique({
      where: { id_userId: { id: input.applicationId, userId } },
      select: { id: true },
    });
    if (!application) return null;
  }

  return prisma.interaction.create({
    data: {
      userId,
      contactId: input.contactId,
      applicationId: input.applicationId ?? null,
      kind: input.kind,
      direction: input.direction,
      occurredAt: input.occurredAt ?? new Date(),
      notes: input.notes ?? null,
    },
  });
}

export type CompanyContacts = {
  company: string;
  contacts: (Contact & {
    applications: { id: string; company: string; role: string }[];
    interactions: Interaction[];
  })[];
};

/** The /contacts page's read model: companies A→Z, contacts A→Z, interactions newest first. */
export async function listContactsByCompany(userId: string): Promise<CompanyContacts[]> {
  const contacts = await prisma.contact.findMany({
    where: { userId },
    include: {
      applications: { include: { application: { select: { id: true, company: true, role: true } } } },
      interactions: { orderBy: { occurredAt: "desc" } },
    },
    orderBy: [{ company: "asc" }, { name: "asc" }],
  });

  const groups = new Map<string, CompanyContacts>();
  for (const contact of contacts) {
    const group = groups.get(contact.company) ?? { company: contact.company, contacts: [] };
    group.contacts.push({
      ...contact,
      applications: contact.applications.map((link) => link.application),
    });
    groups.set(contact.company, group);
  }
  return [...groups.values()];
}
