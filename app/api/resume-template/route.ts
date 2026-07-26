import { NextResponse } from "next/server";
import path from "node:path";
import mammoth from "mammoth";
import { prisma } from "@/lib/db/prisma";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function GET() {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const template = await prisma.resumeTemplate.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceFilename: true, sourceFormat: true, createdAt: true },
  });
  return NextResponse.json({ template });
}

export async function POST(request: Request) {
  // Multipart upload — deliberately NOT behind requireJsonRequest (that guard
  // expects application/json). The session-cookie check below now closes the
  // gap this previously relied on informal reasoning for: this endpoint
  // requires a valid authenticated session like every other mutating route.
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 415 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file too large (5MB max)" }, { status: 413 });
  }

  const filename = path.basename(file.name);
  const ext = path.extname(filename).toLowerCase();
  if (ext !== ".md" && ext !== ".docx") {
    return NextResponse.json({ error: "only .md and .docx are accepted" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentText = ext === ".docx" ? (await mammoth.extractRawText({ buffer })).value : buffer.toString("utf-8");

  const template = await prisma.resumeTemplate.create({
    data: {
      userId,
      sourceFilename: filename,
      sourceFormat: ext === ".docx" ? "docx" : "md",
      contentText,
    },
  });

  return NextResponse.json({ template: { id: template.id, sourceFilename: template.sourceFilename } }, { status: 201 });
}
