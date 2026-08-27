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

  const owned = await prisma.message.findFirst({ where: { id, application: { userId } }, select: { id: true, status: true } });
  if (!owned) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (owned.status === "SENT") {
    const message = await prisma.message.findUniqueOrThrow({ where: { id } });
    return NextResponse.json({ message, idempotent: true });
  }
  if (owned.status !== "APPROVED") {
    return NextResponse.json({ error: "approve the draft before marking it sent" }, { status: 409 });
  }

  const message = await prisma.message.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });
  return NextResponse.json({ message });
}
