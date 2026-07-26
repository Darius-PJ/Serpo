import "server-only";
import { claude, CLAUDE_MODEL } from "./claudeClient";
import type { JobSearchCriteria, NormalizedJobListing } from "@/lib/jobSources/types";

// Bounds token cost: only the first MAX_CANDIDATES deduped listings are sent,
// and descriptions are trimmed before sending — this is a relevance-judging
// pass over data already fetched, not a research task, so it doesn't need
// (and isn't given) the full text or a web_search tool.
const MAX_CANDIDATES = 60;
const DESCRIPTION_PREVIEW_CHARS = 300;

export interface RankedJobResults {
  recommendedIds: string[];
  relatedSearchTerms: string[];
}

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    recommendedIds: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "ids of listings that are genuinely relevant to the search, ordered best-first. Omit junk, off-target, or low-quality postings.",
    },
    relatedSearchTerms: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "3-4 alternate or broader keyword phrasings the searcher could try next to widen their search.",
    },
  },
  required: ["recommendedIds", "relatedSearchTerms"],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You help a job seeker cut through noise in search results. You will be given a search " +
  "query and a list of already-fetched job postings (id, company, role, location, source, " +
  "and a short description excerpt). Judge relevance from the text given — never invent " +
  "details not present. Return the ids of postings that are genuinely relevant to the " +
  "query, ordered best match first, dropping ones that are clearly off-target, duplicate " +
  "in substance, or too sparse to judge. Also suggest a few related or broader search " +
  "phrasings the searcher could try to widen their results — synonyms, adjacent titles, " +
  "or a less narrow phrase, not wildly unrelated roles.";

/**
 * Ranks/filters already-fetched listings and suggests related search terms.
 * Fails soft by design — callers should catch and fall back to the raw
 * deduped list, the same way each individual connector's own errors don't
 * take down the rest of a search.
 */
export async function rankJobResults(
  criteria: JobSearchCriteria,
  listings: NormalizedJobListing[]
): Promise<RankedJobResults> {
  const candidates = listings.slice(0, MAX_CANDIDATES).map((listing) => ({
    id: listing.id,
    company: listing.company,
    role: listing.role,
    location: listing.location,
    source: listing.source,
    description: listing.description?.slice(0, DESCRIPTION_PREVIEW_CHARS),
  }));

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `SEARCH QUERY: "${criteria.keywords}"` +
          (criteria.location ? ` in ${criteria.location}` : "") +
          (criteria.remoteOnly ? " (remote only)" : "") +
          `\n\nCANDIDATE POSTINGS:\n${JSON.stringify(candidates)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error("Claude did not return structured ranking output.");
  }

  const parsed = JSON.parse(textBlock.text) as RankedJobResults;
  return {
    recommendedIds: Array.isArray(parsed.recommendedIds) ? parsed.recommendedIds : [],
    relatedSearchTerms: Array.isArray(parsed.relatedSearchTerms) ? parsed.relatedSearchTerms : [],
  };
}
