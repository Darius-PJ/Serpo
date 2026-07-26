import { z } from "zod";

export interface TailoredResume {
  contactHeader: string;
  summary: string;
  experience: { employer: string; title: string; dates: string; bullets: string[] }[];
  skills: string[];
  education: { institution: string; credential: string; dates: string }[];
}

// Runtime mirror of TAILORED_RESUME_SCHEMA below — Claude is asked for this
// exact JSON shape, but the model's output is still untrusted input until
// validated, since it flows straight into a document a user submits for a
// real job application.
export const TailoredResumeZ = z
  .object({
    contactHeader: z.string(),
    summary: z.string(),
    experience: z
      .array(
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
    education: z
      .array(
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

export class InvalidTailoredResumeError extends Error {
  constructor(details: string) {
    super(`Claude returned an invalid tailored resume shape: ${details}`);
    this.name = "InvalidTailoredResumeError";
  }
}

export const TAILORED_RESUME_SCHEMA = {
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
