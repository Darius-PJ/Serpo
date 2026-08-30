import type { Application, Contact } from "@/generated/prisma";

export const SYSTEM_PROMPT =
  "You draft short, specific outreach messages for a job seeker to send to a hiring " +
  "manager or recruiter. Write in the seeker's voice, first person. No subject line, " +
  "no greeting placeholders like [Name] unless a real name is given, no markdown, no " +
  "emoji. Keep it to 3-5 sentences. Never invent facts about the seeker's background " +
  "that weren't provided.";

/** The contact a draft addresses: the first one with a usable identity. */
export function pickPrimaryContact(contacts: Contact[]): Contact | null {
  return contacts.find((contact) => contact.name || contact.email) ?? null;
}

export function describeApplication(application: Application, contacts: Contact[]) {
  const contact = pickPrimaryContact(contacts);
  const lines = [
    `Company: ${application.company}`,
    `Role: ${application.role}`,
    application.notes ? `Notes from the applicant: ${application.notes}` : null,
    contact?.name ? `Decision-maker name: ${contact.name}` : null,
    contact?.title ? `Decision-maker title: ${contact.title}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
