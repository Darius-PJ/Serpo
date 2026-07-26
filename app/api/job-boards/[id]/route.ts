import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const { id } = await params;
  const body = await request.json();

  const board = await prisma.jobBoard.update({
    where: { id },
    data: { ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}) },
  });

  return NextResponse.json({ board });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const { id } = await params;
  await prisma.jobBoard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
