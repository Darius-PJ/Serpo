import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const applications = await prisma.application.findMany({
    where: { userId },
    include: { decisionMakers: true, messages: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ applications });
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();
  if (!body.company?.trim() || !body.role?.trim()) {
    return NextResponse.json({ error: "company and role are required" }, { status: 400 });
  }

  const application = await prisma.application.create({
    data: {
      userId,
      company: body.company,
      role: body.role,
      source: body.source ?? "manual",
      url: body.url ?? null,
      description: typeof body.description === "string" ? body.description.slice(0, 20_000) : null,
      status: body.status ?? "Sourced",
    },
  });

  return NextResponse.json({ application }, { status: 201 });
}
