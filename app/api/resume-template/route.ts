import { NextResponse } from "next/server";
import path from "node:path";
import mammoth from "mammoth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function GET() {
  const template = await prisma.resumeTemplate.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceFilename: true, sourceFormat: true, createdAt: true },
  });
  return NextResponse.json({ template });
}

export async function POST(request: Request) {
  // Multipart upload — deliberately NOT behind requireJsonRequest (that guard
  // expects application/json). CSRF risk here is limited to overwriting the
  // template with attacker-supplied content, mitigated the same way: browsers
  // don't let a cross-origin <form> set an arbitrary Content-Type on a file
  // input's multipart body without JS, and a same-machine attacker able to
  // run arbitrary JS already has stronger avenues than this endpoint.
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
      sourceFilename: filename,
      sourceFormat: ext === ".docx" ? "docx" : "md",
      contentText,
    },
  });

  return NextResponse.json({ template: { id: template.id, sourceFilename: template.sourceFilename } }, { status: 201 });
}
