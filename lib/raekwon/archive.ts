import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { RaekwonReportResult } from "./reportSchema";

// Local, git-ignored export of Raekwon's output — kept alongside (never
// instead of) the database rows that actually drive the UI. A rolling
// window of the most recent MAX_ARCHIVED_LEADS leads across all runs,
// oldest dropped first.
const ARCHIVE_DIR = path.join(process.cwd(), "data", "raekwon-archive");
const LEADS_FILE = path.join(ARCHIVE_DIR, "leads.json");
const SOURCES_FILE = path.join(ARCHIVE_DIR, "sources.md");
const MAX_ARCHIVED_LEADS = 100;

interface ArchivedLead {
  reportId: string;
  generatedAt: string;
  [key: string]: unknown;
}

async function readJsonLeadsSafe(): Promise<ArchivedLead[]> {
  try {
    const raw = await fs.readFile(LEADS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.leads) ? parsed.leads : [];
  } catch {
    return [];
  }
}

async function readMarkdownSafe(): Promise<string> {
  try {
    return await fs.readFile(SOURCES_FILE, "utf-8");
  } catch {
    return "";
  }
}

export async function appendToArchive(report: { id: string; keyword: string }, result: RaekwonReportResult): Promise<void> {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();

  const existingLeads = await readJsonLeadsSafe();
  const newLeads: ArchivedLead[] = result.leads.map((lead) => ({ ...lead, reportId: report.id, generatedAt }));
  const mergedLeads = [...existingLeads, ...newLeads].slice(-MAX_ARCHIVED_LEADS);
  await fs.writeFile(LEADS_FILE, JSON.stringify({ leads: mergedLeads }, null, 2), "utf-8");

  const keptReportIds = new Set(mergedLeads.map((lead) => lead.reportId));
  const existingSections = (await readMarkdownSafe())
    .split(/\n(?=## Report )/)
    .map((section) => section.trim())
    .filter(Boolean);
  const survivingSections = existingSections.filter((section) => [...keptReportIds].some((id) => section.startsWith(`## Report ${id}`)));
  const newSection = `## Report ${report.id} — ${generatedAt} (${report.keyword})\n\n${result.sourcesHubMarkdown}`;
  await fs.writeFile(SOURCES_FILE, [newSection, ...survivingSections].join("\n\n") + "\n", "utf-8");
}
