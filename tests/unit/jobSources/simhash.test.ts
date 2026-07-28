import { describe, it, expect } from "vitest";
import { computeSimhash, hammingSimilarity } from "@/lib/jobSources/simhash";

// A real cross-posted duplicate is almost always the same wording verbatim,
// wrapped/truncated differently by each board — not an independently
// reworded paraphrase (contractions like "We're" vs "We are" tokenize to
// different words entirely once apostrophes are stripped, so they're a poor
// stand-in for what this feature actually needs to catch).
const CORE_TEXT =
  "We are looking for a Backend Engineer to build and maintain our REST APIs using Node.js and PostgreSQL. You will work closely with the product team to ship new features across our platform, focusing on reliability, performance, and clean API design. We offer a competitive salary, full health benefits, and a flexible remote friendly culture.";
const BACKEND_A = CORE_TEXT;
const BACKEND_B = `<div><p>${CORE_TEXT}</p><p>Apply now through our careers page.</p></div>`;
const DESIGNER =
  "We need a Product Designer to lead our design system work, collaborating with research to craft delightful, accessible user experiences across our mobile and desktop apps.";

describe("computeSimhash / hammingSimilarity", () => {
  it("scores a near-duplicate posting (same wording, HTML-wrapped, extra trailing sentence) at or above the 0.90 default threshold", () => {
    const a = computeSimhash(BACKEND_A);
    const b = computeSimhash(BACKEND_B);
    expect(hammingSimilarity(a, b)).toBeGreaterThanOrEqual(0.9);
  });

  it("scores clearly distinct postings below the 0.90 default threshold", () => {
    const a = computeSimhash(BACKEND_A);
    const b = computeSimhash(DESIGNER);
    expect(hammingSimilarity(a, b)).toBeLessThan(0.9);
  });

  it("strips HTML tags before hashing", () => {
    const plain = computeSimhash("Backend Engineer role building REST APIs");
    const html = computeSimhash("<p>Backend Engineer role building <b>REST APIs</b></p>");
    expect(plain).toBe(html);
  });

  it("produces a stable, well-formed fingerprint for very short text (e.g. a title with no description)", () => {
    const fingerprint = computeSimhash("Backend Engineer");
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingSimilarity(fingerprint, fingerprint)).toBe(1);
  });

  it("returns an all-zero fingerprint for empty text rather than throwing", () => {
    expect(computeSimhash("")).toBe("0".repeat(16));
  });
});
