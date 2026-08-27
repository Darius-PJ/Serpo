import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { requireApiUserId } from "@/lib/auth/session";
import { isStoredResumeArtifactPath } from "@/lib/apply/resumeArtifacts";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  // id comes from the dynamic route segment, not user text — still constrain
  // to the expected shape before touching the filesystem.
  if (!/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // Ownership check BEFORE touching the filesystem — without this, any
  // authenticated account could download any other account's tailored
  // résumé (a real PII document) just by guessing/iterating application ids.
  const application = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!application) {
    return NextResponse.json({ error: "no tailored resume found for this application" }, { status: 404 });
  }

  const latestRun = await prisma.applyRun.findFirst({
    where: { applicationId: id, tailoredResumePath: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { tailoredResumePath: true },
  });
  const filePath = latestRun?.tailoredResumePath;
  if (!filePath || !isStoredResumeArtifactPath(filePath)) {
    return NextResponse.json({ error: "no tailored resume found for this application" }, { status: 404 });
  }
  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="resume-${id}.docx"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "no tailored resume found for this application" }, { status: 404 });
  }
}
