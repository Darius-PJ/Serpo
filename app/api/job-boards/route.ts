import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { parseExternalHttpsUrl, UnsafeExternalUrlError } from "@/lib/security/externalUrl";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const [boards, pins] = await Promise.all([
    prisma.jobBoard.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ jurisdiction: "asc" }, { name: "asc" }],
    }),
    prisma.jobBoardPin.findMany({ where: { userId } }),
  ]);

  // Curated boards' `pinned` column is shared/ignored — this account's own
  // JobBoardPin rows are the source of truth for those. Owned boards keep
  // using their own `pinned` column.
  const pinByBoardId = new Map(pins.map((p) => [p.jobBoardId, p.pinned]));
  const withEffectivePinned = boards
    .map((board) => ({
      ...board,
      pinned: board.userId === null ? (pinByBoardId.get(board.id) ?? true) : board.pinned,
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return NextResponse.json({ boards: withEffectivePinned });
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();
  if (!body.name?.trim() || !body.url?.trim()) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  let url: URL;
  try {
    url = parseExternalHttpsUrl(body.url);
  } catch (err) {
    return NextResponse.json({ error: err instanceof UnsafeExternalUrlError ? err.message : "invalid URL" }, { status: 400 });
  }

  const board = await prisma.jobBoard.create({
    data: {
      userId,
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
