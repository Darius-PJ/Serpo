"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ResumeBubble, type ResumeContent } from "./ResumeBubble";

function sanitizeFilename(text: string): string {
  return (
    text
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "resume"
  );
}

interface WorkspaceProps {
  id: string;
  company: string | null;
  role: string | null;
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

  // A workspace with no company/role isn't tied to any job posting — the
  // Resume tab's default/"fresh" state, which only shows the Improved
  // workflow (there's no job to benchmark against or meld toward).
  const isGeneral = !workspace.company && !workspace.role;
  const meldedUnlocked = !isGeneral && benchmarkStatus === "generated" && improvedStatus === "generated";
  const fileNameStem = isGeneral ? "resume" : `${sanitizeFilename(workspace.company ?? "")}-${sanitizeFilename(workspace.role ?? "")}`;

  return (
    <div className="space-y-8">
      <div className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Resume</h1>
          {isGeneral ? (
            <p className="mt-1 text-sm text-foreground-muted">
              General resume improvement — not tied to a specific job posting.
            </p>
          ) : (
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
          )}
        </div>
        {!isGeneral && (
          <div className="flex gap-2">
            {workspace.originSearchQuery && (
              <Link href={`/sourcing?${workspace.originSearchQuery}`} className="btn-secondary px-3 py-1.5 text-sm">
                ← Back to search
              </Link>
            )}
            <Link href="/resume" className="btn-secondary px-3 py-1.5 text-sm">
              Start fresh
            </Link>
          </div>
        )}
      </div>

      {!templateReady && (
        <div className="card-soft p-4">
          <p className="mb-3 text-sm text-foreground-muted">
            Upload your resume (.md or .docx) to generate an improved version{isGeneral ? "" : " tailored to this role"}.
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

      {!isGeneral && (
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
      )}

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-foreground">Your resume, improved</h2>
        {templateReady ? (
          <ResumeBubble
            workspaceId={workspace.id}
            artifact="improved"
            label="Improved resume"
            disclaimer="An expanded version of your own uploaded resume — may elaborate on real experience and add highly-plausible implied skills, but never invents a new employer, title, or credential. For your own comparison only, never used to apply anywhere."
            initialContent={workspace.improvedContent}
            initialStatus={workspace.improvedStatus}
            initialError={workspace.improvedError}
            generateLabel="Generate improved resume"
            onChanged={setImprovedStatus}
            allowExport
            fileNameBase={`${fileNameStem}-improved`}
          />
        ) : (
          <div className="card-soft p-4">
            <p className="text-sm text-foreground-muted">Upload your resume above to unlock this.</p>
          </div>
        )}
      </section>

      {!isGeneral && (
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
              allowExport
              fileNameBase={`${fileNameStem}-melded`}
            />
          ) : (
            <div className="card-soft p-4">
              <p className="text-sm text-foreground-muted">
                Generate both the competition and improved resumes above to unlock Meld.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
