import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateMessage } from "@/lib/ai/generateMessage";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ messages });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const type = body.type === "FOLLOW_UP" ? "FOLLOW_UP" : "IMMEDIATE";

  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const message = await generateMessage(id, type);
  return NextResponse.json({ message }, { status: 201 });
}
