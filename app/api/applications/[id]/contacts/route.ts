import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { configuredOsintConnectors, researchAllTools } from "@/lib/osint";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { isValidDomain } from "@/lib/validators";
import { findOrCreateContact, linkContactToApplication, listContactsForApplication } from "@/lib/contacts/contacts";

export const dynamic = "force-dynamic";

const MAX_CONTACTS_PER_RESEARCH = 50;

// Per-application dedup of discovery results — distinct from the contact
// merge policy: this stops the same finding being re-saved to one
// application, while findOrCreateContact decides person identity.
function contactKey(contact: { email?: string | null; name?: string | null; title?: string | null }) {
  if (contact.email) return `email:${contact.email.trim().toLowerCase()}`;
  return `person:${(contact.name ?? "").trim().toLowerCase()}|${(contact.title ?? "").trim().toLowerCase()}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const contacts = await listContactsForApplication(userId, id);
  return NextResponse.json({ contacts });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  if (typeof body.contactId === "string") {
    const contact = await prisma.contact.findUnique({
      where: { id_userId: { id: body.contactId, userId } },
    });
    if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });
    const link = await linkContactToApplication(contact.id, id, { sourceTool: "manual", confidence: null });
    return NextResponse.json({ link, contact }, { status: 201 });
  }

  // No server-side guessing/defaulting — the client shows the guessed domain
  // in an editable confirm dialog and must send back whatever the user
  // actually confirmed, so OSINT recon never runs against an unreviewed guess.
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: "a valid domain is required" }, { status: 400 });
  }
  const configured = configuredOsintConnectors();
  if (configured.length === 0) {
    return NextResponse.json({ error: "Contact research is not configured. No research was sent." }, { status: 503 });
  }

  const runs = await researchAllTools(domain);
  const existingLinks = await listContactsForApplication(userId, id);
  const seen = new Set(existingLinks.map((link) => contactKey(link.contact)));
  const created = [];
  let duplicatesSkipped = 0;
  let limitReached = false;
  for (const run of runs) {
    for (const result of run.results) {
      if (!result.email && !result.name) {
        duplicatesSkipped++;
        continue;
      }
      const key = contactKey(result);
      if (seen.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      if (created.length >= MAX_CONTACTS_PER_RESEARCH) {
        limitReached = true;
        break;
      }
      seen.add(key);
      const contact = await findOrCreateContact(userId, application.company, result);
      await linkContactToApplication(contact.id, id, {
        sourceTool: result.sourceTool,
        confidence: result.confidence ?? null,
      });
      created.push(contact);
    }
    if (limitReached) break;
  }

  return NextResponse.json({
    created,
    duplicatesSkipped,
    limitReached,
    runs: runs.map((r) => ({ tool: r.tool, label: r.label, error: r.error })),
  });
}
