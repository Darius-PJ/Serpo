import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const { id } = await params;
  await prisma.profileField.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
