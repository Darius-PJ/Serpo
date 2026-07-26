import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { generateBenchmarkResume } from "@/lib/editor/generateBenchmarkResume";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const draft = await prisma.editorDraft.findUnique({ where: { id_userId: { id, userId } } });
  if (!draft) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const content = await generateBenchmarkResume(draft.company, draft.role, draft.jobDescription ?? undefined);
    const updated = await prisma.editorDraft.update({
      where: { id },
      data: { status: "generated", content: JSON.stringify(content), error: null },
    });
    return NextResponse.json({ draft: { ...updated, content } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await prisma.editorDraft.update({
      where: { id },
      data: { status: "failed", error: message },
    });
    return NextResponse.json({ draft: { ...updated, content: null } }, { status: 500 });
  }
}
