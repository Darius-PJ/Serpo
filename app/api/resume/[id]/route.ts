import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { BenchmarkResumeZ } from "@/lib/resume/benchmarkResumeSchema";
import { ImprovedResumeZ } from "@/lib/resume/improvedResumeSchema";
import { MeldedResumeZ } from "@/lib/resume/meldedResumeSchema";
import { serializeWorkspace } from "@/lib/resume/serializeWorkspace";
import { isResumeArtifact } from "@/lib/resume/artifact";

export const dynamic = "force-dynamic";

const SCHEMAS = {
  benchmark: BenchmarkResumeZ,
  improved: ImprovedResumeZ,
  melded: MeldedResumeZ,
} as const;

const FIELD_NAMES = {
  benchmark: { content: "benchmarkContent", status: "benchmarkStatus", error: "benchmarkError" },
  improved: { content: "improvedContent", status: "improvedStatus", error: "improvedError" },
  melded: { content: "meldedContent", status: "meldedStatus", error: "meldedError" },
} as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const artifact = body.artifact;
  if (!isResumeArtifact(artifact)) {
    return NextResponse.json({ error: "artifact must be one of benchmark, improved, melded" }, { status: 400 });
  }

  const result = SCHEMAS[artifact].safeParse(body.content);
  if (!result.success) {
    return NextResponse.json({ error: "invalid resume content" }, { status: 400 });
  }

  const fields = FIELD_NAMES[artifact];
  try {
    const updated = await prisma.resumeWorkspace.update({
      where: { id_userId: { id, userId } },
      data: { [fields.content]: JSON.stringify(result.data), [fields.status]: "generated", [fields.error]: null },
    });
    return NextResponse.json({ workspace: serializeWorkspace(updated) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw err;
  }
}
