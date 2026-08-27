import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { configuredOsintConnectors, researchAllTools } from "@/lib/osint";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { isValidDomain } from "@/lib/validators";

export const dynamic = "force-dynamic";

const MAX_CONTACTS_PER_RESEARCH = 50;

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

  const decisionMakers = await prisma.decisionMaker.findMany({ where: { applicationId: id }, orderBy: { foundAt: "desc" } });
  return NextResponse.json({ decisionMakers });
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

  // No server-side guessing/defaulting — the client shows the guessed domain
  // in an editable confirm dialog and must send back whatever the user
  // actually confirmed, so OSINT recon never runs against an unreviewed guess.
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: "a valid domain is required" }, { status: 400 });
  }
  const configured = configuredOsintConnectors();
  if (configured.length === 0) {
    return NextResponse.json({ error: "Decision-maker research is not configured. No research was sent." }, { status: 503 });
  }

  const runs = await researchAllTools(domain);
  const existing = await prisma.decisionMaker.findMany({ where: { applicationId: id }, select: { email: true, name: true, title: true } });
  const seen = new Set(existing.map(contactKey));
  const created = [];
  let duplicatesSkipped = 0;
  let limitReached = false;
  for (const run of runs) {
    for (const result of run.results) {
      const key = contactKey(result);
      if (!result.email && !result.name) {
        duplicatesSkipped++;
        continue;
      }
      if (seen.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      if (created.length >= MAX_CONTACTS_PER_RESEARCH) {
        limitReached = true;
        break;
      }
      seen.add(key);
      created.push(
        await prisma.decisionMaker.create({
          data: {
            applicationId: id,
            name: result.name,
            title: result.title,
            email: result.email,
            sourceTool: result.sourceTool,
            confidence: result.confidence,
          },
        })
      );
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
