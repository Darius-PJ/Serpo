import { describe, it, expect } from "vitest";
import { RaekwonReportZ } from "@/lib/raekwon/reportSchema";

const valid = {
  leads: [
    {
      company: "Nova Systems",
      role_title: "Backend Engineer",
      job_type: "Full-time",
      location: "Remote",
      keyword: "backend engineer",
      salary_or_rate: "$120k+",
      rank: 1,
      explanation: "Strong match for backend keyword and remote preference.",
      source_url: "https://example.com/jobs/123",
      duplicate_variants_suppressed: [
        { role_title: "Backend Software Engineer", location: "Remote", source_url: "https://example.com/jobs/999" },
      ],
    },
  ],
  sourcesHubMarkdown: "# Sources\n- **example.com** performed best",
};

describe("RaekwonReportZ", () => {
  it("accepts a well-formed report", () => {
    const result = RaekwonReportZ.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts a null salary_or_rate, an empty duplicate_variants_suppressed array, and an omitted location", () => {
    const { location, ...withoutLocation } = valid.leads[0];
    void location;
    const lead = { ...withoutLocation, salary_or_rate: null, duplicate_variants_suppressed: [] };
    const result = RaekwonReportZ.safeParse({ ...valid, leads: [lead] });
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { role_title, ...missingRole } = valid.leads[0];
    void role_title;
    const result = RaekwonReportZ.safeParse({ ...valid, leads: [missingRole] });
    expect(result.success).toBe(false);
  });

  it("rejects salary_or_rate being omitted entirely (must be string or explicit null)", () => {
    const { salary_or_rate, ...missingSalary } = valid.leads[0];
    void salary_or_rate;
    const result = RaekwonReportZ.safeParse({ ...valid, leads: [missingSalary] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer or non-positive rank", () => {
    expect(RaekwonReportZ.safeParse({ ...valid, leads: [{ ...valid.leads[0], rank: 0 }] }).success).toBe(false);
    expect(RaekwonReportZ.safeParse({ ...valid, leads: [{ ...valid.leads[0], rank: 1.5 }] }).success).toBe(false);
  });

  it("rejects a malformed duplicate_variants_suppressed entry", () => {
    const bad = { ...valid, leads: [{ ...valid.leads[0], duplicate_variants_suppressed: [{ role_title: "X" }] }] };
    const result = RaekwonReportZ.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an invented extra property (guards against schema drift from the model)", () => {
    const withExtra = { ...valid, fabricatedField: "should not be here" };
    const result = RaekwonReportZ.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("rejects completely malformed input", () => {
    expect(RaekwonReportZ.safeParse(null).success).toBe(false);
    expect(RaekwonReportZ.safeParse("a string").success).toBe(false);
  });
});
