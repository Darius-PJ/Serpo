"use client";

import { useState } from "react";
import type { ResumeContent } from "@/lib/resume/resumeContent";
import { downloadResume, EXPORT_FORMAT_LABELS, type ExportFormat } from "@/lib/resume/exportResume";
import { ConfirmDialog } from "./ConfirmDialog";

export type { ResumeContent } from "@/lib/resume/resumeContent";

const EXPORT_FORMATS: ExportFormat[] = ["md", "txt", "docx"];

type ExperienceRow = ResumeContent["experience"][number];
type EducationRow = ResumeContent["education"][number];
type Artifact = "benchmark" | "improved" | "melded";

const EMPTY_RESUME: ResumeContent = {
  contactHeader: "",
  summary: "",
  experience: [],
  skills: [],
  education: [],
};

const CONTENT_FIELD: Record<Artifact, string> = {
  benchmark: "benchmarkContent",
  improved: "improvedContent",
  melded: "meldedContent",
};
const STATUS_FIELD: Record<Artifact, string> = {
  benchmark: "benchmarkStatus",
  improved: "improvedStatus",
  melded: "meldedStatus",
};
const ERROR_FIELD: Record<Artifact, string> = {
  benchmark: "benchmarkError",
  improved: "improvedError",
  melded: "meldedError",
};

/**
 * One self-contained, editable/savable resume "bubble" — reused for all
 * three artifacts on the Resume tab (benchmark/improved/melded), since they
 * share the exact same contactHeader/summary/experience/skills/education
 * shape. Each instance owns its own save/regenerate calls, scoped to its
 * `artifact` slice of the workspace.
 */
export function ResumeBubble({
  workspaceId,
  artifact,
  label,
  disclaimer,
  initialContent,
  initialStatus,
  initialError,
  generateLabel = "Generate",
  onChanged,
  allowExport = false,
  fileNameBase,
}: {
  workspaceId: string;
  artifact: Artifact;
  label: string;
  disclaimer: string;
  initialContent: ResumeContent | null;
  initialStatus: string;
  initialError: string | null;
  generateLabel?: string;
  onChanged?: (status: string) => void;
  allowExport?: boolean;
  fileNameBase?: string;
}) {
  const [resume, setResume] = useState<ResumeContent>(initialContent ?? EMPTY_RESUME);
  const [skillsText, setSkillsText] = useState((initialContent?.skills ?? []).join("\n"));
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("md");
  const [exporting, setExporting] = useState(false);

  function applyContent(content: ResumeContent) {
    setResume(content);
    setSkillsText(content.skills.join("\n"));
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/resume/${workspaceId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact }),
      });
      const data = await res.json();
      const workspace = data.workspace;
      if (res.ok && workspace?.[STATUS_FIELD[artifact]] === "generated") {
        applyContent(workspace[CONTENT_FIELD[artifact]]);
        setStatus("generated");
        onChanged?.("generated");
      } else {
        setStatus("failed");
        setError(workspace?.[ERROR_FIELD[artifact]] ?? data.error ?? "Generation failed.");
        onChanged?.("failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const content: ResumeContent = { ...resume, skills: skillsText.split("\n").map((s) => s.trim()).filter(Boolean) };
      const res = await fetch(`/api/resume/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact, content }),
      });
      if (res.ok) {
        setSavedAt(new Date());
        onChanged?.("generated");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmExport() {
    setExporting(true);
    try {
      const content: ResumeContent = { ...resume, skills: skillsText.split("\n").map((s) => s.trim()).filter(Boolean) };
      await downloadResume(content, exportFormat, fileNameBase ?? "resume");
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  }

  function updateExperience(index: number, patch: Partial<ExperienceRow>) {
    setResume((prev) => ({
      ...prev,
      experience: prev.experience.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function addExperience() {
    setResume((prev) => ({
      ...prev,
      experience: [...prev.experience, { employer: "", title: "", dates: "", bullets: [] }],
    }));
  }

  function removeExperience(index: number) {
    setResume((prev) => ({ ...prev, experience: prev.experience.filter((_, i) => i !== index) }));
  }

  function updateEducation(index: number, patch: Partial<EducationRow>) {
    setResume((prev) => ({
      ...prev,
      education: prev.education.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function addEducation() {
    setResume((prev) => ({ ...prev, education: [...prev.education, { institution: "", credential: "", dates: "" }] }));
  }

  function removeEducation(index: number) {
    setResume((prev) => ({ ...prev, education: prev.education.filter((_, i) => i !== index) }));
  }

  if (status === "not_started") {
    return (
      <div className="card-soft p-4">
        <h2 className="mb-2 font-bold text-foreground">{label}</h2>
        <p className="mb-3 text-xs text-foreground-muted">{disclaimer}</p>
        <button onClick={regenerate} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">
          {busy ? "Working… (up to a minute)" : generateLabel}
        </button>
        {error && <p className="mt-2 text-sm text-danger-dark">{error}</p>}
      </div>
    );
  }

  if (status === "failed" && !initialContent) {
    return (
      <div className="card-soft p-4">
        <h2 className="mb-2 font-bold text-foreground">{label}</h2>
        <p className="mb-3 text-sm text-danger-dark">{error ?? "Generation failed."}</p>
        <button onClick={regenerate} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">
          {busy ? "Trying again…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-foreground">{label}</h2>
          {savedAt && <span className="text-xs text-foreground-muted">Saved {savedAt.toLocaleTimeString()}</span>}
        </div>
        <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{disclaimer}</p>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">
            {busy ? "Working…" : "Save"}
          </button>
          <button onClick={regenerate} disabled={busy} className="btn-secondary px-3 py-1.5 text-sm">
            {busy ? "Working…" : "Regenerate"}
          </button>
          {allowExport && (
            <button onClick={() => setExportOpen(true)} disabled={busy} className="btn-secondary px-3 py-1.5 text-sm">
              Download
            </button>
          )}
        </div>
      </div>

      {allowExport && (
        <ConfirmDialog
          open={exportOpen}
          title="Download this resume"
          description="Choose a format, then pick where to save the file in your browser's download prompt."
          confirmLabel="Download"
          busy={exporting}
          onConfirm={confirmExport}
          onCancel={() => setExportOpen(false)}
        >
          <label className="mb-1 block text-xs text-foreground-muted">Format</label>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            className="input-soft w-full px-2.5 py-1.5 text-sm"
          >
            {EXPORT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {EXPORT_FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </ConfirmDialog>
      )}

      {error && status === "failed" && <p className="text-sm text-danger-dark">Last attempt failed: {error}</p>}

      <div className="card-soft p-4">
        <label className="mb-1 block text-xs font-medium text-foreground-muted">Contact header</label>
        <input
          value={resume.contactHeader}
          onChange={(e) => setResume((prev) => ({ ...prev, contactHeader: e.target.value }))}
          className="input-soft w-full px-3 py-1.5 text-sm"
        />
      </div>

      <div className="card-soft p-4">
        <label className="mb-1 block text-xs font-medium text-foreground-muted">Summary</label>
        <textarea
          value={resume.summary}
          onChange={(e) => setResume((prev) => ({ ...prev, summary: e.target.value }))}
          rows={3}
          className="input-soft w-full p-2 text-sm"
        />
      </div>

      <div className="card-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-foreground">Experience</h2>
          <button onClick={addExperience} className="btn-secondary px-2.5 py-1 text-xs">
            Add row
          </button>
        </div>
        <div className="space-y-3">
          {resume.experience.map((row, i) => (
            <div key={i} className="rounded-xl border border-border-soft p-3">
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={row.employer}
                  onChange={(e) => updateExperience(i, { employer: e.target.value })}
                  placeholder="Employer"
                  className="input-soft px-2.5 py-1 text-sm"
                />
                <input
                  value={row.title}
                  onChange={(e) => updateExperience(i, { title: e.target.value })}
                  placeholder="Title"
                  className="input-soft px-2.5 py-1 text-sm"
                />
                <input
                  value={row.dates}
                  onChange={(e) => updateExperience(i, { dates: e.target.value })}
                  placeholder="Dates"
                  className="input-soft px-2.5 py-1 text-sm"
                />
              </div>
              <textarea
                value={row.bullets.join("\n")}
                onChange={(e) => updateExperience(i, { bullets: e.target.value.split("\n") })}
                placeholder="One bullet per line"
                rows={3}
                className="input-soft w-full p-2 text-sm"
              />
              <button onClick={() => removeExperience(i)} className="btn-danger-outline mt-2 px-2.5 py-1 text-xs">
                Remove
              </button>
            </div>
          ))}
          {resume.experience.length === 0 && <p className="text-sm text-foreground-muted">No experience rows yet.</p>}
        </div>
      </div>

      <div className="card-soft p-4">
        <label className="mb-1 block text-xs font-medium text-foreground-muted">Skills (one per line)</label>
        <textarea value={skillsText} onChange={(e) => setSkillsText(e.target.value)} rows={4} className="input-soft w-full p-2 text-sm" />
      </div>

      <div className="card-soft p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-foreground">Education</h2>
          <button onClick={addEducation} className="btn-secondary px-2.5 py-1 text-xs">
            Add row
          </button>
        </div>
        <div className="space-y-3">
          {resume.education.map((row, i) => (
            <div key={i} className="rounded-xl border border-border-soft p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={row.institution}
                  onChange={(e) => updateEducation(i, { institution: e.target.value })}
                  placeholder="Institution"
                  className="input-soft px-2.5 py-1 text-sm"
                />
                <input
                  value={row.credential}
                  onChange={(e) => updateEducation(i, { credential: e.target.value })}
                  placeholder="Credential"
                  className="input-soft px-2.5 py-1 text-sm"
                />
                <input
                  value={row.dates}
                  onChange={(e) => updateEducation(i, { dates: e.target.value })}
                  placeholder="Dates"
                  className="input-soft px-2.5 py-1 text-sm"
                />
              </div>
              <button onClick={() => removeEducation(i)} className="btn-danger-outline mt-2 px-2.5 py-1 text-xs">
                Remove
              </button>
            </div>
          ))}
          {resume.education.length === 0 && <p className="text-sm text-foreground-muted">No education rows yet.</p>}
        </div>
      </div>
    </div>
  );
}
