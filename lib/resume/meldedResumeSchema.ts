import { z } from "zod";

// A fourth distinct resume type, alongside TailoredResume (real
// applications), BenchmarkResume (fully fictional competitor), and
// ImprovedResume (grounded elaboration of the user's real resume). This one
// is explicitly an aspirational blend of the other two — it may contain
// growth-target elements adapted from the fictional benchmark that the user
// does not actually have yet. Never a factual claim, never used for a real
// application.
export interface MeldedResume {
  contactHeader: string;
  summary: string;
  experience: { employer: string; title: string; dates: string; bullets: string[] }[];
  skills: string[];
  education: { institution: string; credential: string; dates: string }[];
}

export const MeldedResumeZ = z
  .object({
    contactHeader: z.string(),
    summary: z.string(),
    experience: z.array(
      z
        .object({
          employer: z.string(),
          title: z.string(),
          dates: z.string(),
          bullets: z.array(z.string()),
        })
        .strict()
    ),
    skills: z.array(z.string()),
    education: z.array(
      z
        .object({
          institution: z.string(),
          credential: z.string(),
          dates: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export class InvalidMeldedResumeError extends Error {
  constructor(details: string) {
    super(`Claude returned an invalid melded resume shape: ${details}`);
    this.name = "InvalidMeldedResumeError";
  }
}

export const MELDED_RESUME_SCHEMA = {
  type: "object" as const,
  properties: {
    contactHeader: { type: "string" as const },
    summary: { type: "string" as const },
    experience: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          employer: { type: "string" as const },
          title: { type: "string" as const },
          dates: { type: "string" as const },
          bullets: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["employer", "title", "dates", "bullets"],
        additionalProperties: false,
      },
    },
    skills: { type: "array" as const, items: { type: "string" as const } },
    education: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          institution: { type: "string" as const },
          credential: { type: "string" as const },
          dates: { type: "string" as const },
        },
        required: ["institution", "credential", "dates"],
        additionalProperties: false,
      },
    },
  },
  required: ["contactHeader", "summary", "experience", "skills", "education"],
  additionalProperties: false,
};
