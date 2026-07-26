import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const boards = await prisma.jobBoard.findMany({
    orderBy: [{ pinned: "desc" }, { jurisdiction: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ boards });
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const body = await request.json();
  if (!body.name?.trim() || !body.url?.trim()) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return NextResponse.json({ error: "url must be http(s)" }, { status: 400 });
  }

  const board = await prisma.jobBoard.create({
    data: {
      name: body.name,
      url: url.toString(),
      jurisdiction: ["federal", "state", "municipal", "other"].includes(body.jurisdiction)
        ? body.jurisdiction
        : "other",
      region: body.region ?? null,
      source: body.source === "ai-discovered" ? "ai-discovered" : "manual",
      pinned: true,
    },
  });

  return NextResponse.json({ board }, { status: 201 });
}
