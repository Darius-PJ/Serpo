import { NextResponse } from "next/server";
import { addTitleAlias } from "@/lib/jobSources/titleAliases";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const keyword = typeof body.keyword === "string" ? body.keyword.slice(0, MAX_FIELD_LENGTH) : "";
  const alias = typeof body.alias === "string" ? body.alias.slice(0, MAX_FIELD_LENGTH) : "";
  if (!keyword.trim() || !alias.trim()) {
    return NextResponse.json({ error: "keyword and alias are required" }, { status: 400 });
  }

  try {
    const created = await addTitleAlias(userId, keyword, alias);
    return NextResponse.json({ alias: created });
  } catch {
    // addTitleAlias throws when normalization leaves nothing (e.g. "!!!").
    return NextResponse.json({ error: "keyword and alias are required" }, { status: 400 });
  }
}
