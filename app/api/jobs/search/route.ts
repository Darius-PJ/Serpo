import { NextResponse } from "next/server";
import { searchAllSources } from "@/lib/jobSources";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const body = await request.json();
  const keywords = typeof body.keywords === "string" ? body.keywords.slice(0, MAX_FIELD_LENGTH) : "";
  if (!keywords.trim()) {
    return NextResponse.json({ error: "keywords is required" }, { status: 400 });
  }

  const results = await searchAllSources({
    keywords,
    location: typeof body.location === "string" ? body.location.slice(0, MAX_FIELD_LENGTH) : undefined,
    remoteOnly: Boolean(body.remoteOnly),
  });

  return NextResponse.json({ results });
}
