import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { researchAllTools } from "@/lib/osint";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { isValidDomain } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const decisionMakers = await prisma.decisionMaker.findMany({ where: { applicationId: id } });
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
  if (!isValidDomain(body.domain)) {
    return NextResponse.json({ error: "a valid domain is required" }, { status: 400 });
  }
  const domain = body.domain;

  const runs = await researchAllTools(domain);
  const created = [];
  for (const run of runs) {
    for (const result of run.results) {
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
  }

  return NextResponse.json({ created, runs: runs.map((r) => ({ tool: r.tool, error: r.error })) });
}
