import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Clears this account's recorded searches (lib/companies/searchHistory.ts). */
export async function DELETE(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { count } = await prisma.searchHistoryEntry.deleteMany({ where: { userId } });
  return NextResponse.json({ cleared: count });
}
