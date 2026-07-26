import { prisma } from "@/lib/db/prisma";
import { JobBoardPanel } from "@/components/JobBoardPanel";
import { JobSearchForm } from "@/components/JobSearchForm";

export const dynamic = "force-dynamic";

export default async function SourcingPage() {
  const boards = await prisma.jobBoard.findMany({
    orderBy: [{ pinned: "desc" }, { jurisdiction: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Source Jobs</h1>
      <JobBoardPanel boards={boards} />
      <JobSearchForm />
    </div>
  );
}
