import { describe, it, expect } from "vitest";
import { resumeToMarkdown, resumeToPlainText } from "@/lib/resume/exportResume";
import type { ResumeContent } from "@/lib/resume/resumeContent";

const resume: ResumeContent = {
  contactHeader: "Jordan Lee · jordan.lee@example.com",
  summary: "Backend engineer with 4 years of Node.js experience.",
  experience: [
    { employer: "Acme Corp", title: "Software Engineer", dates: "2021-2025", bullets: ["Built REST APIs", "Migrated a monolith"] },
  ],
  skills: ["Node.js", "TypeScript"],
  education: [{ institution: "State University", credential: "B.S. CS", dates: "2017-2021" }],
};

describe("resumeToMarkdown", () => {
  it("includes the contact header, summary, and section headers", () => {
    const md = resumeToMarkdown(resume);
    expect(md).toContain("# Jordan Lee · jordan.lee@example.com");
    expect(md).toContain("## Summary");
    expect(md).toContain(resume.summary);
    expect(md).toContain("## Experience");
    expect(md).toContain("### Software Engineer — Acme Corp (2021-2025)");
    expect(md).toContain("- Built REST APIs");
    expect(md).toContain("## Skills");
    expect(md).toContain("- Node.js");
    expect(md).toContain("## Education");
    expect(md).toContain("- B.S. CS, State University (2017-2021)");
  });
});

describe("resumeToPlainText", () => {
  it("includes all sections without markdown syntax", () => {
    const text = resumeToPlainText(resume);
    expect(text).toContain("Jordan Lee · jordan.lee@example.com");
    expect(text).toContain("SUMMARY");
    expect(text).toContain(resume.summary);
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Software Engineer — Acme Corp (2021-2025)");
    expect(text).toContain("Built REST APIs");
    expect(text).toContain("SKILLS");
    expect(text).toContain("Node.js, TypeScript");
    expect(text).toContain("EDUCATION");
    expect(text).toContain("B.S. CS, State University (2017-2021)");
    expect(text).not.toContain("##");
  });
});
