import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";

export const dynamic = "force-dynamic";

// "Add resource" on a Gatherer find never silently wires anything up — arbitrary
// discovered sites can't be safely auto-integrated as live connectors without
// human review, the same "AI suggests, human acts" pattern used everywhere
// else in this app (résumé tailoring, message drafts, saved-board suggestions).
// This returns guidance and, where plausible, a starting-point code snippet in
// this codebase's own Adapter shape (lib/jobAdapters/types.ts,
// docs/adding-a-source.md) — never executed automatically.
interface IntegrationGuide {
  explanation: string;
  suggestedApproach: "api" | "scrape" | "bookmark-only" | "not-a-job-source";
  codeSnippet?: string;
}

const GUIDE_SCHEMA = {
  type: "object" as const,
  properties: {
    explanation: { type: "string" as const, description: "2-4 sentences on what this site is and how it could realistically be integrated" },
    suggestedApproach: {
      type: "string" as const,
      enum: ["api", "scrape", "bookmark-only", "not-a-job-source"],
    },
    codeSnippet: {
      type: "string" as const,
      description: "Only when suggestedApproach is 'api' and a plausible public API is known — a starting-point TypeScript adapter implementing this app's Adapter interface. Omit otherwise.",
    },
  },
  required: ["explanation", "suggestedApproach"],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You help a developer evaluate how a discovered job-related site could be added to an " +
  "existing job-search app. The app already has an Adapter interface: { metadata: { id, " +
  "displayName, homepage, tosNotes, sourceKind }, capabilities: { queryModel: 'keyword-search' | " +
  "'enumerate-target' | 'full-dump', paginationStyle, runtime, cost, latencyClass, ... }, " +
  "configSchema, isConfigured(): boolean, healthCheck(ctx), search(query, ctx): " +
  "AsyncGenerator<{ items, nextCursor, partial }>, normalize(rawItem, ctx): NormalizedJobListing } " +
  "where NormalizedJobListing has identity/core/location/compensation/employment/provenance " +
  "fields, each explicitly nullable rather than guessed when the source doesn't provide it. " +
  "Given a site's name and URL, explain plainly what " +
  "kind of integration is realistic: \"api\" if it plausibly has or is known to have a public " +
  "JSON API (only if you have real knowledge of one — do not invent an endpoint), \"scrape\" if " +
  "it would require HTML scraping (note this raises Terms of Service considerations the site " +
  "owner should weigh), \"bookmark-only\" if it's better kept as a browse-only saved link, or " +
  "\"not-a-job-source\" if it doesn't actually fit. Only include a code snippet for the \"api\" " +
  "case, and only when you have genuine grounds to believe the API shape you're describing is " +
  "real — otherwise omit it rather than guess.";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 500) : "";
  const category = typeof body.category === "string" ? body.category.slice(0, 50) : "";
  if (!name || !url) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: GUIDE_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Site: ${name}\nURL: ${url}\nCategory: ${category || "unknown"}\n\nHow could this realistically be added to the app's search space?`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    return NextResponse.json({ error: "Claude did not return guidance" }, { status: 502 });
  }

  const guide = JSON.parse(textBlock.text) as IntegrationGuide;
  return NextResponse.json({ guide });
}
