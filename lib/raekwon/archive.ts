import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { RaekwonReportResult } from "./reportSchema";

// Local, git-ignored export of Raekwon's output — kept alongside (never
// instead of) the database rows that actually drive the UI. A rolling
// window of the most recent MAX_ARCHIVED_LEADS leads across all runs,
// oldest dropped first.
const ARCHIVE_ROOT = path.join(process.cwd(), "data", "raekwon-archive");
const MAX_ARCHIVED_LEADS = 100;

interface ArchivedLead {
  reportId: string;
  generatedAt: string;
  [key: string]: unknown;
}

function archivePaths(userId: string) {
  const archiveDir = path.join(ARCHIVE_ROOT, userId);
  return { archiveDir, leadsFile: path.join(archiveDir, "leads.json"), sourcesFile: path.join(archiveDir, "sources.md") };
}

async function readJsonLeadsSafe(leadsFile: string): Promise<ArchivedLead[]> {
  try {
    const raw = await fs.readFile(leadsFile, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.leads) ? parsed.leads : [];
  } catch {
    return [];
  }
}

async function readMarkdownSafe(sourcesFile: string): Promise<string> {
  try {
    return await fs.readFile(sourcesFile, "utf-8");
  } catch {
    return "";
  }
}

export async function appendToArchive(report: { id: string; userId: string; keyword: string }, result: RaekwonReportResult): Promise<void> {
  const { archiveDir, leadsFile, sourcesFile } = archivePaths(report.userId);
  await fs.mkdir(archiveDir, { recursive: true });
  const generatedAt = new Date().toISOString();

  const existingLeads = await readJsonLeadsSafe(leadsFile);
  const newLeads: ArchivedLead[] = result.leads.map((lead) => ({ ...lead, reportId: report.id, generatedAt }));
  const mergedLeads = [...existingLeads, ...newLeads].slice(-MAX_ARCHIVED_LEADS);
  await fs.writeFile(leadsFile, JSON.stringify({ leads: mergedLeads }, null, 2), "utf-8");

  const keptReportIds = new Set(mergedLeads.map((lead) => lead.reportId));
  const existingSections = (await readMarkdownSafe(sourcesFile))
    .split(/\n(?=## Report )/)
    .map((section) => section.trim())
    .filter(Boolean);
  const survivingSections = existingSections.filter((section) => [...keptReportIds].some((id) => section.startsWith(`## Report ${id}`)));
  const newSection = `## Report ${report.id} — ${generatedAt} (${report.keyword})\n\n${result.sourcesHubMarkdown}`;
  await fs.writeFile(sourcesFile, [newSection, ...survivingSections].join("\n\n") + "\n", "utf-8");
}

/** Removes report-specific data from the shared archive layout used before archives became account-scoped. */
export async function purgeLegacyArchivedReports(reportIds: string[]): Promise<number> {
  if (reportIds.length === 0) return 0;
  const legacyLeadsFile = path.join(ARCHIVE_ROOT, "leads.json");
  const legacySourcesFile = path.join(ARCHIVE_ROOT, "sources.md");
  const ids = new Set(reportIds);
  const remainingLeads = (await readJsonLeadsSafe(legacyLeadsFile)).filter((lead) => !ids.has(lead.reportId));
  let failures = 0;
  try {
    await fs.writeFile(legacyLeadsFile, JSON.stringify({ leads: remainingLeads }, null, 2), "utf-8");
  } catch {
    // The legacy archive may not exist; database deletion remains authoritative.
    if (await fs.stat(legacyLeadsFile).then(() => true).catch(() => false)) failures++;
  }
  try {
    const sections = (await readMarkdownSafe(legacySourcesFile))
      .split(/\n(?=## Report )/)
      .map((section) => section.trim())
      .filter(Boolean)
      .filter((section) => !reportIds.some((id) => section.startsWith(`## Report ${id}`)));
    await fs.writeFile(legacySourcesFile, sections.length ? sections.join("\n\n") + "\n" : "", "utf-8");
  } catch {
    // The legacy archive may not exist; database deletion remains authoritative.
    if (await fs.stat(legacySourcesFile).then(() => true).catch(() => false)) failures++;
  }
  return failures;
}

export async function purgeAccountArchive(userId: string): Promise<void> {
  const { archiveDir } = archivePaths(userId);
  await fs.rm(archiveDir, { recursive: true, force: true });
}
