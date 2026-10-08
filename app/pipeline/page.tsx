import Link from "next/link";
import { requireUserIdForPage } from "@/lib/auth/session";
import { listPipelineCards } from "@/lib/pipeline/boardData";
import { PipelineBoard } from "@/components/PipelineBoard";
import { NewApplicationForm } from "@/components/NewApplicationForm";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const userId = await requireUserIdForPage();
  const cards = await listPipelineCards(userId);

  return (
    <div>
      <div className="page-heading mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">Pipeline</h1>
          <p className="page-lede mb-0">Every application by stage. Drag a card or change its status; each move is kept in the application&apos;s timeline.</p>
        </div>
        <Link href="/dashboard" className="btn-primary">
          Search for roles
        </Link>
      </div>

      <NewApplicationForm />

      <PipelineBoard cards={cards} />
    </div>
  );
}
