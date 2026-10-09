import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { isIndustryId } from "@/lib/companies/industries";

export const dynamic = "force-dynamic";

/** Replaces the industries this account picked on the Companies page. */
export async function PUT(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const requested: unknown = body && typeof body === "object" ? body.industries : undefined;
  if (!Array.isArray(requested) || !requested.every(isIndustryId)) {
    return NextResponse.json({ error: "industries must be a list of known industry ids" }, { status: 400 });
  }

  const industries = [...new Set(requested)];
  await prisma.$transaction([
    prisma.industryInterest.deleteMany({ where: { userId } }),
    prisma.industryInterest.createMany({ data: industries.map((industry) => ({ userId, industry })) }),
  ]);
  return NextResponse.json({ industries });
}
