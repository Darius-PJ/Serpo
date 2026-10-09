import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { COMPANY_CATALOG, companyKey } from "@/lib/companies/catalog";

export const dynamic = "force-dynamic";

/** "Not interested": stops suggesting one catalog company to this account. */
export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const input = body && typeof body === "object" ? body : {};
  const company = typeof input.platform === "string" && typeof input.token === "string"
    ? COMPANY_CATALOG.find((entry) => companyKey(entry.platform, entry.token) === companyKey(input.platform, input.token))
    : undefined;
  if (!company) {
    return NextResponse.json({ error: "not a suggested company" }, { status: 400 });
  }

  const where = { userId, platform: company.platform, token: company.token };
  await prisma.hiddenCompanySuggestion.upsert({
    where: { userId_platform_token: where },
    update: {},
    create: where,
  });
  return NextResponse.json({ ok: true });
}

/** Brings every hidden suggestion back. */
export async function DELETE(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { count } = await prisma.hiddenCompanySuggestion.deleteMany({ where: { userId } });
  return NextResponse.json({ restored: count });
}
