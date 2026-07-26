import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { generateBenchmarkResume } from "@/lib/editor/generateBenchmarkResume";

export const dynamic = "force-dynamic";

const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const company = typeof body.company === "string" ? body.company.trim().slice(0, MAX_FIELD_LENGTH) : "";
  const role = typeof body.role === "string" ? body.role.trim().slice(0, MAX_FIELD_LENGTH) : "";
  if (!company || !role) {
    return NextResponse.json({ error: "company and role are required" }, { status: 400 });
  }
  const jobDescription =
    typeof body.jobDescription === "string" ? body.jobDescription.slice(0, MAX_DESCRIPTION_LENGTH) : undefined;
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.slice(0, 1000) : undefined;

  const draft = await prisma.editorDraft.create({
    data: { userId, company, role, jobDescription, sourceUrl, status: "pending" },
  });

  try {
    const content = await generateBenchmarkResume(company, role, jobDescription);
    const updated = await prisma.editorDraft.update({
      where: { id: draft.id },
      data: { status: "generated", content: JSON.stringify(content) },
    });
    return NextResponse.json({ draft: { ...updated, content } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await prisma.editorDraft.update({
      where: { id: draft.id },
      data: { status: "failed", error: message },
    });
    return NextResponse.json({ draft: { ...updated, content: null } }, { status: 201 });
  }
}
