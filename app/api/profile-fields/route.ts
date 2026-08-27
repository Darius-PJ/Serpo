import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const PROFILE_FIELD_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_LABEL_LENGTH = 120;
const MAX_VALUE_LENGTH = 2_000;

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

  const body = await request.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim().slice(0, MAX_LABEL_LENGTH) : "";
  const value = typeof body.value === "string" ? body.value.slice(0, MAX_VALUE_LENGTH) : null;
  if (!PROFILE_FIELD_KEY.test(key) || !label || value === null) {
    return NextResponse.json({ error: "key, label, and value are required" }, { status: 400 });
  }

  const field = await prisma.profileField.upsert({
    where: { userId_key: { userId, key } },
    update: { label, value },
    create: { userId, key, label, value },
  });

  return NextResponse.json({ field });
}
