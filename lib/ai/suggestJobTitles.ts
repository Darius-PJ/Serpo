import "server-only";
import { claude, CLAUDE_MODEL } from "./claudeClient";

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    titles: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "3-5 alternate or related entry/mid-level job titles the searcher could also try.",
    },
  },
  required: ["titles"],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You suggest alternate or related job titles for a job seeker's search. Given a searched " +
  "job title, return 3-5 similar or adjacent titles that use different but common industry " +
  "phrasing (synonyms, adjacent specializations, alternate seniority-neutral wording) — " +
  "the kind of titles a real hiring posting would use. Keep every suggestion entry- or " +
  "mid-level (never include \"senior\", \"lead\", \"staff\", \"principal\", \"director\", or " +
  "similar seniority markers). Do not just repeat the input.";

/**
 * Suggests related job titles to search — a much lighter call than last
 * turn's relevance-ranking pass (no listing data sent, just the query), since
 * exact-title matching now does the filtering work deterministically. Fails
 * soft — callers should catch and just skip showing suggestions.
 */
export async function suggestJobTitles(keywords: string): Promise<string[]> {
  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Searched title: "${keywords}"` }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new Error("Claude did not return structured title suggestions.");
  }

  const parsed = JSON.parse(textBlock.text) as { titles?: unknown };
  return Array.isArray(parsed.titles) ? parsed.titles.filter((t): t is string => typeof t === "string") : [];
}
