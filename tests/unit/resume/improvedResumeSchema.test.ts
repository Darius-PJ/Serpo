import { describe, it, expect } from "vitest";
import { ImprovedResumeZ } from "@/lib/resume/improvedResumeSchema";

const valid = {
  contactHeader: "Jordan Lee · jordan.lee@example.com",
  summary: "Backend engineer with 4 years of Node.js experience.",
  experience: [
    { employer: "Acme Corp", title: "Software Engineer", dates: "2021-2025", bullets: ["Built REST APIs in Node.js"] },
  ],
  skills: ["Node.js", "TypeScript"],
  education: [{ institution: "State University", credential: "B.S. CS", dates: "2017-2021" }],
};

describe("ImprovedResumeZ", () => {
  it("accepts a well-formed improved resume", () => {
    const result = ImprovedResumeZ.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { contactHeader, ...missingHeader } = valid;
    void contactHeader;
    const result = ImprovedResumeZ.safeParse(missingHeader);
    expect(result.success).toBe(false);
  });

  it("rejects an invented extra property (guards against schema drift from the model)", () => {
    const withExtra = { ...valid, fabricatedField: "should not be here" };
    const result = ImprovedResumeZ.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("rejects wrong types inside nested experience entries", () => {
    const bad = { ...valid, experience: [{ employer: "Acme Corp", title: "Engineer", dates: "2021", bullets: "not an array" }] };
    const result = ImprovedResumeZ.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects completely malformed input", () => {
    expect(ImprovedResumeZ.safeParse(null).success).toBe(false);
    expect(ImprovedResumeZ.safeParse("a string").success).toBe(false);
  });
});
