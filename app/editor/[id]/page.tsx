import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { EditorView } from "@/components/EditorView";
import type { BenchmarkResume } from "@/lib/editor/benchmarkResumeSchema";

export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserIdForPage();
  const { id } = await params;

  const draft = await prisma.editorDraft.findUnique({ where: { id_userId: { id, userId } } });
  if (!draft) notFound();

  let content: BenchmarkResume | null = null;
  if (draft.content) {
    try {
      content = JSON.parse(draft.content) as BenchmarkResume;
    } catch {
      content = null;
    }
  }

  return (
    <div>
      <div className="card-soft mb-6 p-4">
        <h1 className="text-xl font-extrabold text-foreground">The Editor</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {draft.role} <span className="font-medium">at</span> {draft.company}
          {draft.sourceUrl && (
            <>
              {" · "}
              <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary-dark underline">
                Original posting
              </a>
            </>
          )}
        </p>
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Illustrative competitive-benchmark example — a fictional candidate profile showing the
          caliber of application you may be up against for this role. This is not your resume and
          is never used to apply anywhere.
        </p>
      </div>

      <EditorView
        draftId={draft.id}
        status={draft.status}
        error={draft.error}
        initialContent={content}
      />
    </div>
  );
}
