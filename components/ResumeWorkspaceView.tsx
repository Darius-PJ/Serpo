"use client";

import { useRef, useState } from "react";
import { ResumeBubble, type ResumeContent } from "./ResumeBubble";

interface WorkspaceProps {
  id: string;
  company: string;
  role: string;
  sourceUrl: string | null;
  originSearchQuery: string | null;
  benchmarkContent: ResumeContent | null;
  benchmarkStatus: string;
  benchmarkError: string | null;
  improvedContent: ResumeContent | null;
  improvedStatus: string;
  improvedError: string | null;
  meldedContent: ResumeContent | null;
  meldedStatus: string;
  meldedError: string | null;
}

export function ResumeWorkspaceView({
  workspace,
  hasResumeTemplate,
}: {
  workspace: WorkspaceProps;
  hasResumeTemplate: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [templateReady, setTemplateReady] = useState(hasResumeTemplate);
  const [benchmarkStatus, setBenchmarkStatus] = useState(workspace.benchmarkStatus);
  const [improvedStatus, setImprovedStatus] = useState(workspace.improvedStatus);

  async function uploadResume(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/resume-template", { method: "POST", body: formData });
      if (res.ok) setTemplateReady(true);
    } finally {
      setUploading(false);
    }
  }

  const meldedUnlocked = benchmarkStatus === "generated" && improvedStatus === "generated";

  return (
    <div className="space-y-8">
      <div className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Resume</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {workspace.role} <span className="font-medium">at</span> {workspace.company}
            {workspace.sourceUrl && (
              <>
                {" · "}
                <a href={workspace.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary-dark underline">
                  Original posting
                </a>
              </>
            )}
          </p>
        </div>
        {workspace.originSearchQuery && (
          <a href={`/sourcing?${workspace.originSearchQuery}`} className="btn-secondary px-3 py-1.5 text-sm">
            ← Back to search
          </a>
        )}
      </div>

      {!templateReady && (
        <div className="card-soft p-4">
          <p className="mb-3 text-sm text-foreground-muted">
            Upload your resume (.md or .docx) to generate an improved version tailored to this role.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.docx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary px-3 py-1.5 text-sm">
            {uploading ? "Uploading…" : "Upload resume"}
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-foreground">Your competition</h2>
        <ResumeBubble
          workspaceId={workspace.id}
          artifact="benchmark"
          label="Competitive benchmark"
          disclaimer="Illustrative competitive-benchmark example — a fictional candidate profile showing the caliber of application you may be up against. Not your resume, never used to apply anywhere."
          initialContent={workspace.benchmarkContent}
          initialStatus={workspace.benchmarkStatus}
          initialError={workspace.benchmarkError}
          onChanged={setBenchmarkStatus}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-foreground">Your resume, improved</h2>
        {templateReady ? (
          <ResumeBubble
            workspaceId={workspace.id}
            artifact="improved"
            label="Improved resume"
            disclaimer="An expanded version of your own uploaded resume for this role — may elaborate on real experience and add highly-plausible implied skills, but never invents a new employer, title, or credential. For your own comparison only, never used to apply anywhere."
            initialContent={workspace.improvedContent}
            initialStatus={workspace.improvedStatus}
            initialError={workspace.improvedError}
            generateLabel="Generate improved resume"
            onChanged={setImprovedStatus}
          />
        ) : (
          <div className="card-soft p-4">
            <p className="text-sm text-foreground-muted">Upload your resume above to unlock this.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-foreground">Meld: where you could grow</h2>
        {meldedUnlocked ? (
          <ResumeBubble
            workspaceId={workspace.id}
            artifact="melded"
            label="Melded resume"
            disclaimer="An aspirational hybrid resume blending your real background with growth-target elements from the competitive benchmark. This is not a factual claim about you today — it is illustrative only and never used to apply anywhere."
            initialContent={workspace.meldedContent}
            initialStatus={workspace.meldedStatus}
            initialError={workspace.meldedError}
            generateLabel="Meld"
          />
        ) : (
          <div className="card-soft p-4">
            <p className="text-sm text-foreground-muted">
              Generate both the competition and improved resumes above to unlock Meld.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
