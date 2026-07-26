import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { researchAllTools } from "@/lib/osint";
import { requireJsonRequest } from "@/lib/security/guard";
import { isValidDomain } from "@/lib/validators";

export const dynamic = "force-dynamic";

function domainFromCompany(company: string) {
  return company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionMakers = await prisma.decisionMaker.findMany({ where: { applicationId: id } });
  return NextResponse.json({ decisionMakers });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const domain = body.domain !== undefined ? body.domain : domainFromCompany(application.company);

  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: "invalid domain" }, { status: 400 });
  }

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
