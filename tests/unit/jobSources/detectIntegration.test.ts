import { describe, it, expect } from "vitest";
import { detectBoardIntegration } from "@/lib/jobSources/detectIntegration";

describe("detectBoardIntegration", () => {
  it("detects a Greenhouse public board URL", () => {
    expect(detectBoardIntegration("https://boards.greenhouse.io/acme")).toEqual({
      type: "greenhouse",
      token: "acme",
    });
  });

  it("detects a Greenhouse API URL", () => {
    expect(detectBoardIntegration("https://boards-api.greenhouse.io/v1/boards/acme/jobs")).toEqual({
      type: "greenhouse",
      token: "acme",
    });
  });

  it("detects a job-boards.greenhouse.io URL", () => {
    expect(detectBoardIntegration("https://job-boards.greenhouse.io/acme")).toEqual({
      type: "greenhouse",
      token: "acme",
    });
  });

  it("detects a Lever public board URL", () => {
    expect(detectBoardIntegration("https://jobs.lever.co/acme")).toEqual({ type: "lever", token: "acme" });
  });

  it("detects a Lever API URL", () => {
    expect(detectBoardIntegration("https://api.lever.co/v0/postings/acme")).toEqual({
      type: "lever",
      token: "acme",
    });
  });

  it("returns null for an unrecognized site", () => {
    expect(detectBoardIntegration("https://www.calcareers.ca.gov")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(detectBoardIntegration("not a url")).toBeNull();
  });

  it("returns null when a token segment is missing", () => {
    expect(detectBoardIntegration("https://boards.greenhouse.io")).toBeNull();
  });
});
