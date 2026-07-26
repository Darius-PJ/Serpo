"use client";

import { useState } from "react";
import type { BenchmarkResume } from "@/lib/editor/benchmarkResumeSchema";

type ExperienceRow = BenchmarkResume["experience"][number];
type EducationRow = BenchmarkResume["education"][number];

const EMPTY_RESUME: BenchmarkResume = {
  contactHeader: "",
  summary: "",
  experience: [],
  skills: [],
  education: [],
};

export function EditorView({
  draftId,
  status,
  error,
  initialContent,
}: {
  draftId: string;
  status: string;
  error: string | null;
  initialContent: BenchmarkResume | null;
}) {
  const [resume, setResume] = useState<BenchmarkResume>(initialContent ?? EMPTY_RESUME);
  const [skillsText, setSkillsText] = useState((initialContent?.skills ?? []).join("\n"));
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentError, setCurrentError] = useState(error);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function applyContent(content: BenchmarkResume) {
    setResume(content);
    setSkillsText(content.skills.join("\n"));
  }

  async function regenerate() {
    setBusy(true);
    setCurrentError(null);
    try {
      const res = await fetch(`/api/editor/${draftId}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (res.ok && data.draft?.content) {
        applyContent(data.draft.content);
        setCurrentStatus("generated");
      } else {
        setCurrentStatus("failed");
        setCurrentError(data.draft?.error ?? "Generation failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const content: BenchmarkResume = { ...resume, skills: skillsText.split("\n").map((s) => s.trim()).filter(Boolean) };
      const res = await fetch(`/api/editor/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setSavedAt(new Date());
      }
    } finally {
      setBusy(false);
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

  if (currentStatus === "failed" && !initialContent) {
    return (
      <div className="card-soft p-4">
        <p className="mb-3 text-sm text-danger-dark">{currentError ?? "Generation failed."}</p>
        <button onClick={regenerate} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">
          {busy ? "Trying again…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-soft flex items-center justify-between p-4">
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">
            {busy ? "Working…" : "Save"}
          </button>
          <button onClick={regenerate} disabled={busy} className="btn-secondary px-3 py-1.5 text-sm">
            {busy ? "Working…" : "Regenerate"}
          </button>
        </div>
        {savedAt && <span className="text-xs text-foreground-muted">Saved {savedAt.toLocaleTimeString()}</span>}
      </div>

      {currentError && currentStatus === "failed" && (
        <p className="text-sm text-danger-dark">Last regeneration failed: {currentError}</p>
      )}

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
