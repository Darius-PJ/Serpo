"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ResumeBubble, type ResumeContent } from "./ResumeBubble";
import { MELD_SOURCE_LABELS, type MeldSource } from "@/lib/resume/meldSource";

function sanitizeFilename(text: string): string {
  return (
    text
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "resume"
  );
}

const MELD_SOURCE_ORDER: MeldSource[] = ["reference", "improved", "benchmark"];

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
  meldSourceA: string | null;
  meldSourceB: string | null;
}

export function ResumeWorkspaceView({
  workspace,
  initialTemplateText,
}: {
  workspace: WorkspaceProps;
  initialTemplateText: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [templateText, setTemplateText] = useState(initialTemplateText);
  const [benchmarkStatus, setBenchmarkStatus] = useState(workspace.benchmarkStatus);
  const [improvedStatus, setImprovedStatus] = useState(workspace.improvedStatus);

  const templateReady = templateText !== null;

  async function uploadResume(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/resume-template", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setTemplateText(data.template?.contentText ?? "");
      }
    } finally {
      setUploading(false);
    }
  }

  // A workspace with no company/role isn't tied to any job posting — the
  // Resume tab's default/"fresh" state, which only shows the Improved
  // workflow (there's no job to benchmark against or meld toward, and no
  // separate Reference display — just upload + Touch-Up).
  const isGeneral = !workspace.company && !workspace.role;

  const availableMeldSources = MELD_SOURCE_ORDER.filter((source) => {
    if (source === "reference") return templateReady;
    if (source === "improved") return improvedStatus === "generated";
    return benchmarkStatus === "generated";
  });

  const initialMeldA = availableMeldSources.includes(workspace.meldSourceA as MeldSource)
    ? (workspace.meldSourceA as MeldSource)
    : (availableMeldSources[0] ?? "");
  const initialMeldB = availableMeldSources.includes(workspace.meldSourceB as MeldSource) && workspace.meldSourceB !== initialMeldA
    ? (workspace.meldSourceB as MeldSource)
    : (availableMeldSources.find((s) => s !== initialMeldA) ?? "");
  const [meldSourceA, setMeldSourceA] = useState<MeldSource | "">(initialMeldA);
  const [meldSourceB, setMeldSourceB] = useState<MeldSource | "">(initialMeldB);

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

      {isGeneral ? (
        <>
          {!templateReady && (
            <div className="card-soft p-4">
              <p className="mb-3 text-sm text-foreground-muted">Upload your resume (.md or .docx) to touch it up.</p>
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
                generateLabel="Touch-Up"
                regenerateLabel="Touch-Up"
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
        </>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-lg font-extrabold text-foreground">Reference resume</h2>
            <div className="card-soft p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-foreground-muted">
                  Your uploaded resume, unmodified — the source for Improved and an option for Meld.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.docx"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary shrink-0 px-3 py-1.5 text-sm"
                >
                  {uploading ? "Uploading…" : templateReady ? "Replace resume" : "Browse"}
                </button>
              </div>
              {templateReady ? (
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border-soft bg-surface p-3 text-xs text-foreground">
                  {templateText}
                </pre>
              ) : (
                <p className="text-sm text-foreground-muted">No resume uploaded yet.</p>
              )}
            </div>
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
                allowExport
                fileNameBase={`${fileNameStem}-improved`}
              />
            ) : (
              <div className="card-soft p-4">
                <p className="text-sm text-foreground-muted">Upload your resume above to unlock this.</p>
              </div>
            )}
          </section>

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
            <h2 className="mb-3 text-lg font-extrabold text-foreground">Meld</h2>
            {availableMeldSources.length >= 2 ? (
              <div className="space-y-3">
                <div className="card-soft flex flex-wrap items-end gap-3 p-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground-muted">Meld A</label>
                    <select
                      value={meldSourceA}
                      onChange={(e) => setMeldSourceA(e.target.value as MeldSource)}
                      className="input-soft px-2.5 py-1.5 text-sm"
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {availableMeldSources
                        .filter((source) => source !== meldSourceB)
                        .map((source) => (
                          <option key={source} value={source}>
                            {MELD_SOURCE_LABELS[source]}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground-muted">Meld B</label>
                    <select
                      value={meldSourceB}
                      onChange={(e) => setMeldSourceB(e.target.value as MeldSource)}
                      className="input-soft px-2.5 py-1.5 text-sm"
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {availableMeldSources
                        .filter((source) => source !== meldSourceA)
                        .map((source) => (
                          <option key={source} value={source}>
                            {MELD_SOURCE_LABELS[source]}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <ResumeBubble
                  workspaceId={workspace.id}
                  artifact="melded"
                  label="Melded resume"
                  disclaimer="An aspirational hybrid resume blending the two resumes you chose above. When one of them is the competitive benchmark, added elements represent a growth target, not a factual claim about you today — either way, this is illustrative only and never used to apply anywhere."
                  initialContent={workspace.meldedContent}
                  initialStatus={workspace.meldedStatus}
                  initialError={workspace.meldedError}
                  generateLabel="Meld"
                  onChanged={() => {}}
                  extraRegenerateBody={{ meldSourceA, meldSourceB }}
                  regenerateDisabled={!meldSourceA || !meldSourceB || meldSourceA === meldSourceB}
                  allowExport
                  fileNameBase={`${fileNameStem}-melded`}
                />
              </div>
            ) : (
              <div className="card-soft p-4">
                <p className="text-sm text-foreground-muted">
                  Upload your resume and generate at least one more resume above (improved or competition) to unlock Meld.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
