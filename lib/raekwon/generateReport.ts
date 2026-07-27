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
// Hard cap on how long a single generation may spend calling Claude — this
// call mixes adaptive thinking with a web_search tool loop, which can run
// long uncapped; a firm ceiling keeps the Generate button from appearing to
// hang, and callers surface a clean "failed" state if it's hit. 120s gives
// web_search-based live verification realistic room to finish a batch while
// still bounding worst-case wait time.
const CLAUDE_TIMEOUT_MS = 120_000;

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
  "for more out on the open internet. You are working under a strict time budget, so be " +
  "decisive: don't over-search. Your job:\n" +
  "1. Select and/or find up to the requested batch size of the strongest, most relevant leads " +
  "for the given keyword/location/job-type/compensation criteria — mixing picks from the " +
  "supplied pantry with fresh finds from your own web_search when it turns up something " +
  "better. You may explore close synonyms or adjacent title phrasings of the given keyword to " +
  "broaden the search, and record whichever exact phrase actually surfaced each lead in that " +
  "lead's keyword field.\n" +
  "2. VERIFY every lead you include is a real, currently-live posting via web_search before " +
  "including it — never invent a company, role, or URL. If you can't verify a supplied pantry " +
  "listing is still live, either verify it via search or drop it rather than guess.\n" +
  "3. Rank the leads you return by strength of fit for this search, 1 = strongest, filling the " +
  "rank field with no gaps or repeats.\n" +
  "4. For each lead, set job_type to a short free-text description of what's actually stated or " +
  "clearly inferable (e.g. \"Full-time\", \"Contract\", \"Unknown\") and set salary_or_rate to the " +
  "exact figure only when actually stated somewhere you found it, or null — never estimate or " +
  "invent a number.\n" +
  "5. If the same underlying role turns up more than once (cross-posted on another board, or a " +
  "near-duplicate listing), pick the single best/canonical posting as the lead itself and record " +
  "the other near-duplicate postings in that lead's duplicate_variants_suppressed array instead " +
  "of returning them as separate leads — keep the main list free of near-duplicate padding.\n" +
  "6. Write a short explanation for each lead — why it's a strong prospect.\n" +
  "7. Write sourcesHubMarkdown: a short markdown report on which sources or sites (referring to " +
  "them by domain, since leads carry a source_url but no separate source label) performed best " +
  "this run and why. Use ONLY basic markdown: # / ## headers, - bullets, **bold**, and " +
  "[text](url) links — no tables, no images, no other syntax, since the UI renders a minimal " +
  "hand-built parser.";

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
  const response = await claude.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: RAEKWON_REPORT_SCHEMA } },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: Math.min(criteria.batchSize + 2, 12) }],
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(criteria, candidatePool) }],
    },
    { timeout: CLAUDE_TIMEOUT_MS, maxRetries: 0 }
  );

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
