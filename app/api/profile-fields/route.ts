import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const fields = await prisma.profileField.findMany({ where: { userId }, orderBy: { label: "asc" } });
  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();
  if (!body.key?.trim() || !body.label?.trim() || typeof body.value !== "string") {
    return NextResponse.json({ error: "key, label, and value are required" }, { status: 400 });
  }

  const field = await prisma.profileField.upsert({
    where: { userId_key: { userId, key: body.key } },
    update: { label: body.label, value: body.value },
    create: { userId, key: body.key, label: body.label, value: body.value },
  });

  return NextResponse.json({ field });
}
