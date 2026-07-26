import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { JobBoardPanel } from "@/components/JobBoardPanel";
import { JobSearchForm } from "@/components/JobSearchForm";

export const dynamic = "force-dynamic";

export default async function SourcingPage() {
  const userId = await requireUserIdForPage();

  const [boards, pins] = await Promise.all([
    prisma.jobBoard.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ jurisdiction: "asc" }, { name: "asc" }],
    }),
    prisma.jobBoardPin.findMany({ where: { userId } }),
  ]);

  const pinByBoardId = new Map(pins.map((p) => [p.jobBoardId, p.pinned]));
  const boardsWithEffectivePinned = boards
    .map((board) => ({
      ...board,
      pinned: board.userId === null ? (pinByBoardId.get(board.id) ?? true) : board.pinned,
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-foreground">Source Jobs</h1>
      <JobBoardPanel boards={boardsWithEffectivePinned} />
      <JobSearchForm />
    </div>
  );
}
