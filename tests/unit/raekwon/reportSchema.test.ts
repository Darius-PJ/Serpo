import { describe, it, expect } from "vitest";
import { RaekwonReportZ } from "@/lib/raekwon/reportSchema";

const valid = {
  leads: [
    {
      company: "Nova Systems",
      role: "Backend Engineer",
      location: "Remote",
      url: "https://example.com/jobs/123",
      sourceLabel: "Greenhouse",
      jobType: "full-time",
      compensation: "$120k+",
      rationale: "Strong match for backend keyword and remote preference.",
    },
  ],
  sourcesHubMarkdown: "# Sources\n- **Greenhouse** performed best",
};

describe("RaekwonReportZ", () => {
  it("accepts a well-formed report", () => {
    const result = RaekwonReportZ.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts leads without optional location/compensation", () => {
    const { location, compensation, ...rest } = valid.leads[0];
    void location;
    void compensation;
    const result = RaekwonReportZ.safeParse({ ...valid, leads: [rest] });
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { role, ...missingRole } = valid.leads[0];
    void role;
    const result = RaekwonReportZ.safeParse({ ...valid, leads: [missingRole] });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid jobType enum value", () => {
    const bad = { ...valid, leads: [{ ...valid.leads[0], jobType: "part-time" }] };
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
