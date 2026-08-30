import Link from "next/link";
import { requireUserIdForPage } from "@/lib/auth/session";
import { listPipelineCards } from "@/lib/pipeline/boardData";
import { PipelineBoard } from "@/components/PipelineBoard";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const userId = await requireUserIdForPage();
  const cards = await listPipelineCards(userId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-foreground">Pipeline</h1>
        <Link href="/sourcing" className="btn-primary px-3 py-1.5 text-sm">
          Source jobs
        </Link>
      </div>

      <PipelineBoard cards={cards} />
    </div>
  );
}
