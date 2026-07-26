import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json();

  const board = await prisma.jobBoard.findUnique({ where: { id } });
  if (!board) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (board.userId !== null && board.userId !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (typeof body.pinned !== "boolean") {
    return NextResponse.json({ board });
  }

  if (board.userId === null) {
    // Shared curated board — pin state is per-account, never mutate the shared row.
    const pin = await prisma.jobBoardPin.upsert({
      where: { userId_jobBoardId: { userId, jobBoardId: id } },
      update: { pinned: body.pinned },
      create: { userId, jobBoardId: id, pinned: body.pinned },
    });
    return NextResponse.json({ board: { ...board, pinned: pin.pinned } });
  }

  const updated = await prisma.jobBoard.update({ where: { id }, data: { pinned: body.pinned } });
  return NextResponse.json({ board: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const board = await prisma.jobBoard.findUnique({ where: { id } });
  if (!board) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (board.userId === null) {
    return NextResponse.json({ error: "cannot delete a shared curated board" }, { status: 403 });
  }
  if (board.userId !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.jobBoard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
