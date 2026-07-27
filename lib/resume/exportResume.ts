import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { ResumeContent } from "./resumeContent";

export type ExportFormat = "md" | "txt" | "docx";

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  md: "Markdown (.md)",
  txt: "Plain text (.txt)",
  docx: "Word (.docx)",
};

export function resumeToMarkdown(resume: ResumeContent): string {
  const lines: string[] = [`# ${resume.contactHeader}`, "", "## Summary", resume.summary, "", "## Experience", ""];
  for (const job of resume.experience) {
    lines.push(`### ${job.title} — ${job.employer} (${job.dates})`);
    for (const bullet of job.bullets) lines.push(`- ${bullet}`);
    lines.push("");
  }
  lines.push("## Skills", "", ...resume.skills.map((s) => `- ${s}`), "", "## Education", "");
  for (const edu of resume.education) {
    lines.push(`- ${edu.credential}, ${edu.institution} (${edu.dates})`);
  }
  return lines.join("\n");
}

export function resumeToPlainText(resume: ResumeContent): string {
  const lines: string[] = [resume.contactHeader, "", "SUMMARY", resume.summary, "", "EXPERIENCE", ""];
  for (const job of resume.experience) {
    lines.push(`${job.title} — ${job.employer} (${job.dates})`);
    for (const bullet of job.bullets) lines.push(`  - ${bullet}`);
    lines.push("");
  }
  lines.push("SKILLS", resume.skills.join(", "), "", "EDUCATION", "");
  for (const edu of resume.education) {
    lines.push(`${edu.credential}, ${edu.institution} (${edu.dates})`);
  }
  return lines.join("\n");
}

function docxHeading(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
}
function docxBullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 } });
}

// Deliberately not shared with lib/apply/renderDocx.ts (which serves the
// real, submitted Apply flow) even though the paragraph-building logic is
// similar — this one runs client-side via Packer.toBlob for a browser
// download, that one runs server-side via Packer.toBuffer to disk; keeping
// them separate avoids any risk of an export-feature change touching the
// real-application rendering path.
async function resumeToDocxBlob(resume: ResumeContent): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: resume.contactHeader, bold: true })] }),
    new Paragraph({ text: "" }),
    docxHeading("Summary"),
    new Paragraph({ text: resume.summary }),
    docxHeading("Experience"),
  ];
  for (const job of resume.experience) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${job.title} — ${job.employer}`, bold: true }), new TextRun({ text: `  (${job.dates})` })],
      })
    );
    for (const bullet of job.bullets) children.push(docxBullet(bullet));
  }
  children.push(docxHeading("Skills"), new Paragraph({ text: resume.skills.join(", ") }));
  children.push(docxHeading("Education"));
  for (const edu of resume.education) {
    children.push(new Paragraph({ text: `${edu.credential}, ${edu.institution} (${edu.dates})` }));
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

const MIME_TYPES: Record<ExportFormat, string> = {
  md: "text/markdown",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Builds the file for the given format and triggers a plain browser download. */
export async function downloadResume(resume: ResumeContent, format: ExportFormat, filenameBase: string): Promise<void> {
  const blob =
    format === "docx" ? await resumeToDocxBlob(resume) : new Blob([format === "md" ? resumeToMarkdown(resume) : resumeToPlainText(resume)], { type: MIME_TYPES[format] });
  triggerBrowserDownload(blob, `${filenameBase}.${format}`);
}
