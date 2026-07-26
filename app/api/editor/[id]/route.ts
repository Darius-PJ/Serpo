import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { BenchmarkResumeZ } from "@/lib/editor/benchmarkResumeSchema";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const result = BenchmarkResumeZ.safeParse(body.content);
  if (!result.success) {
    return NextResponse.json({ error: "invalid resume content" }, { status: 400 });
  }

  try {
    const updated = await prisma.editorDraft.update({
      where: { id_userId: { id, userId } },
      data: { content: JSON.stringify(result.data), status: "generated", error: null },
    });
    return NextResponse.json({ draft: { ...updated, content: result.data } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw err;
  }
}
