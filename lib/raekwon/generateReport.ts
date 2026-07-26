import "server-only";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";
import type { NormalizedJobListing } from "@/lib/jobSources/types";
import {
  RAEKWON_REPORT_SCHEMA,
  RaekwonReportZ,
  InvalidRaekwonReportError,
  type RaekwonReportResult,
} from "./reportSchema";

const MAX_CANDIDATES = 60;
const DESCRIPTION_PREVIEW_CHARS = 300;

export interface RaekwonCriteria {
  keyword: string;
  batchSize: number;
  location?: string;
  jobType?: "full-time" | "contract";
  compensationTarget?: string;
}

const SYSTEM_PROMPT =
  "You are Raekwon, the chef of this job tracker — you search for fresh \"ingredients\" (job " +
  "leads) and cook up a report for a job seeker. You're given a starting pantry of listings " +
  "already fetched from this app's own job-source connectors, plus a web_search tool to hunt " +
  "for more out on the open internet. Your job:\n" +
  "1. Select and/or find up to the requested batch size of the strongest, most relevant leads " +
  "for the given keyword/location/job-type/compensation criteria — mixing picks from the " +
  "supplied pantry with fresh finds from your own web_search when it turns up something " +
  "better.\n" +
  "2. VERIFY every lead you include is a real, currently-live posting via web_search before " +
  "including it — never invent a company, role, or URL. If you can't verify a supplied pantry " +
  "listing is still live, either verify it via search or drop it rather than guess.\n" +
  "3. For each lead, note its jobType (full-time/contract/unknown) and compensation only when " +
  "actually stated somewhere you found it — never estimate or invent a number.\n" +
  "4. Write a short rationale for each lead — why it's a strong prospect for this search.\n" +
  "5. Write sourcesHubMarkdown: a short markdown report on which sources (by sourceLabel — this " +
  "app's connector labels, or sites you found via web_search) performed best this run and why. " +
  "Use ONLY basic markdown: # / ## headers, - bullets, **bold**, and [text](url) links — no " +
  "tables, no images, no other syntax, since the UI renders a minimal hand-built parser.";

function buildUserPrompt(criteria: RaekwonCriteria, candidates: NormalizedJobListing[]): string {
  const trimmed = candidates.slice(0, MAX_CANDIDATES).map((listing) => ({
    company: listing.company,
    role: listing.role,
    location: listing.location,
    url: listing.url,
    source: listing.source,
    description: listing.description?.slice(0, DESCRIPTION_PREVIEW_CHARS),
  }));

  return (
    `KEYWORD: ${criteria.keyword}\n` +
    `BATCH SIZE (max leads to return): ${criteria.batchSize}\n` +
    (criteria.location ? `LOCATION: ${criteria.location}\n` : "") +
    (criteria.jobType ? `JOB TYPE: ${criteria.jobType}\n` : "") +
    (criteria.compensationTarget ? `COMPENSATION TARGET (advisory, not a hard cutoff): ${criteria.compensationTarget}\n` : "") +
    `\nPANTRY (already-fetched candidates from this app's own connectors, may be empty):\n${JSON.stringify(trimmed)}`
  );
}

export async function generateRaekwonReport(
  criteria: RaekwonCriteria,
  candidatePool: NormalizedJobListing[]
): Promise<RaekwonReportResult> {
  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: RAEKWON_REPORT_SCHEMA } },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: Math.min(criteria.batchSize + 5, 20) }],
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(criteria, candidatePool) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error("Claude did not return a structured Raekwon report.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidRaekwonReportError("response was not valid JSON");
  }

  const result = RaekwonReportZ.safeParse(parsed);
  if (!result.success) {
    throw new InvalidRaekwonReportError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}
