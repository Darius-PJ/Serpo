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
  if (application.submissionState !== "confirmed") {
    return NextResponse.json({ error: "confirm the application submission before generating outreach" }, { status: 409 });
  }
  if (type === "FOLLOW_UP") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (!application.appliedAt || application.appliedAt > sevenDaysAgo) {
      return NextResponse.json({ error: "a follow-up draft is available seven days after confirmed submission" }, { status: 409 });
    }
    if (application.followUpGeneratedAt) {
      return NextResponse.json({ error: "a follow-up draft has already been generated for this application" }, { status: 409 });
    }
  }

  const message = await generateMessage(id, type);
  if (type === "FOLLOW_UP") {
    await prisma.application.update({ where: { id }, data: { followUpGeneratedAt: new Date() } });
  }
  return NextResponse.json({ message }, { status: 201 });
}
