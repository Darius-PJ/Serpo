import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const owned = await prisma.message.findFirst({ where: { id, application: { userId } }, select: { id: true } });
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const message = await prisma.message.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      ...(typeof body.draftText === "string" ? { draftText: body.draftText } : {}),
    },
  });

  return NextResponse.json({ message });
}
