// Shared shape for all four resume-like artifacts in this app
// (BenchmarkResume, ImprovedResume, MeldedResume, and lib/apply's
// TailoredResume) — lives here, not under components/, so both client
// components and plain lib modules (e.g. lib/resume/exportResume.ts) can
// import it without a lib -> components dependency.
export interface ResumeContent {
  contactHeader: string;
  summary: string;
  experience: { employer: string; title: string; dates: string; bullets: string[] }[];
  skills: string[];
  education: { institution: string; credential: string; dates: string }[];
}
