import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const fields = await prisma.profileField.findMany({ orderBy: { label: "asc" } });
  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const body = await request.json();
  if (!body.key?.trim() || !body.label?.trim() || typeof body.value !== "string") {
    return NextResponse.json({ error: "key, label, and value are required" }, { status: 400 });
  }

  const field = await prisma.profileField.upsert({
    where: { key: body.key },
    update: { label: body.label, value: body.value },
    create: { key: body.key, label: body.label, value: body.value },
  });

  return NextResponse.json({ field });
}
