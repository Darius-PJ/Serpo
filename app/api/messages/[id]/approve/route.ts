import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

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
