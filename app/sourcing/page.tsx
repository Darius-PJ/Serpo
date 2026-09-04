import { Suspense } from "react";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { JobBoardPanel } from "@/components/JobBoardPanel";
import { JobSearchForm } from "@/components/JobSearchForm";
import Link from "next/link";

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

  const pinByBoardId = new Map(pins.map((p) => [p.jobBoardId, p]));
  const boardsWithPoolInfo = boards
    .map((board) => {
      const pin = pinByBoardId.get(board.id);
      return {
        ...board,
        pinned: board.userId === null ? (pin?.pinned ?? true) : board.pinned,
        poolStatus: pin?.poolStatus ?? null,
        integrationType: pin?.integrationType ?? null,
      };
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">Sourcing</h1>
          <p className="page-lede mb-0">Job boards, saved resources, and the AI scout. The quick search also lives on the dashboard.</p>
        </div>
        <Link href="/raekwon" className="btn-secondary">Open AI Scout</Link>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <Suspense fallback={null}>
            <JobSearchForm />
          </Suspense>
        </div>
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <JobBoardPanel boards={boardsWithPoolInfo} />
        </div>
      </div>
    </div>
  );
}
