import { z } from "zod";

export interface RaekwonDuplicateVariant {
  role_title: string;
  location?: string;
  source_url: string;
}

export interface RaekwonLeadResult {
  company: string;
  role_title: string;
  job_type: string;
  location?: string;
  keyword: string;
  salary_or_rate: string | null;
  rank: number;
  explanation: string;
  source_url: string;
  duplicate_variants_suppressed: RaekwonDuplicateVariant[];
}

export interface RaekwonReportResult {
  leads: RaekwonLeadResult[];
  sourcesHubMarkdown: string;
}

const RaekwonDuplicateVariantZ = z
  .object({
    role_title: z.string(),
    location: z.string().optional(),
    source_url: z.string(),
  })
  .strict();

const RaekwonLeadZ = z
  .object({
    company: z.string(),
    role_title: z.string(),
    job_type: z.string(),
    location: z.string().optional(),
    keyword: z.string(),
    salary_or_rate: z.string().nullable(),
    rank: z.number().int().positive(),
    explanation: z.string(),
    source_url: z.string(),
    duplicate_variants_suppressed: z.array(RaekwonDuplicateVariantZ),
  })
  .strict();

export const RaekwonReportZ = z
  .object({
    leads: z.array(RaekwonLeadZ),
    sourcesHubMarkdown: z.string(),
  })
  .strict();

export class InvalidRaekwonReportError extends Error {
  constructor(details: string) {
    super(`Claude returned an invalid Raekwon report shape: ${details}`);
    this.name = "InvalidRaekwonReportError";
  }
}

const DUPLICATE_VARIANT_SCHEMA = {
  type: "object" as const,
  properties: {
    role_title: { type: "string" as const },
    location: { type: "string" as const },
    source_url: { type: "string" as const },
  },
  required: ["role_title", "source_url"],
  additionalProperties: false,
};

export const RAEKWON_REPORT_SCHEMA = {
  type: "object" as const,
  properties: {
    leads: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          company: { type: "string" as const },
          role_title: { type: "string" as const },
          job_type: { type: "string" as const, description: "Free text, e.g. \"Full-time\", \"Contract\", \"Unknown\" — only what's actually stated or clearly inferable." },
          location: { type: "string" as const },
          keyword: { type: "string" as const, description: "The exact keyword or a close synonym/variation that surfaced this particular lead." },
          salary_or_rate: {
            type: ["string", "null"] as const,
            description: "Stated salary or hourly rate exactly as found, or null if not stated anywhere — never estimate.",
          },
          rank: { type: "integer" as const, description: "1-based rank within this batch by strength of fit, 1 = strongest." },
          explanation: { type: "string" as const },
          source_url: { type: "string" as const },
          duplicate_variants_suppressed: {
            type: "array" as const,
            description:
              "Near-duplicate postings of this same underlying role (cross-posted elsewhere, or minor title/location variants) that were folded into this lead instead of listed separately.",
            items: DUPLICATE_VARIANT_SCHEMA,
          },
        },
        required: ["company", "role_title", "job_type", "keyword", "salary_or_rate", "rank", "explanation", "source_url", "duplicate_variants_suppressed"],
        additionalProperties: false,
      },
    },
    sourcesHubMarkdown: {
      type: "string" as const,
      description:
        "Markdown using only headers (#/##), bullet lists (-), bold (**text**), and links ([text](url)) — the UI renders a minimal parser, not a full markdown library.",
    },
  },
  required: ["leads", "sourcesHubMarkdown"],
  additionalProperties: false,
};
