import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // id comes from the dynamic route segment, not user text — still constrain
  // to the expected shape before touching the filesystem.
  if (!/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const filePath = path.resolve(process.cwd(), "data", "resumes", `${id}.docx`);
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
