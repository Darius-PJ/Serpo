import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { TailoredResume } from "./resumeSchema";

function heading(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
}

function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 } });
}

export async function renderResumeDocx(resume: TailoredResume, applicationId: string): Promise<string> {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: resume.contactHeader, bold: true })] }),
    new Paragraph({ text: "" }),
    heading("Summary"),
    new Paragraph({ text: resume.summary }),
    heading("Experience"),
  ];

  for (const job of resume.experience) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${job.title} — ${job.employer}`, bold: true }), new TextRun({ text: `  (${job.dates})` })],
      })
    );
    for (const b of job.bullets) children.push(bullet(b));
  }

  children.push(heading("Skills"), new Paragraph({ text: resume.skills.join(", ") }));

  children.push(heading("Education"));
  for (const edu of resume.education) {
    children.push(new Paragraph({ text: `${edu.credential}, ${edu.institution} (${edu.dates})` }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  const dir = path.resolve(process.cwd(), "data", "resumes");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${applicationId}.docx`);
  await writeFile(filePath, buffer);

  return filePath;
}
