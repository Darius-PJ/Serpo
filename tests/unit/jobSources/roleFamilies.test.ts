import { describe, expect, it } from "vitest";
import { familyAliasesFor, familySocCodesFor } from "@/lib/jobSources/roleFamilies";

// These assert against the committed O*NET-derived artifact
// (lib/jobSources/roleFamilies/onetTitleFamilies.json.gz), so they pin real
// data the product behavior depends on — not fixtures.
describe("O*NET role families", () => {
  it("maps 'network engineer' onto the network SOC family", () => {
    const socs = familySocCodesFor("network engineer");
    expect(socs).toContain("15-1241.00"); // Computer Network Architects
    expect(socs).toContain("15-1244.00"); // Network and Computer Systems Administrators
  });

  it("family aliases include same-responsibility titles the query's words never mention", () => {
    const aliases = familyAliasesFor("network engineer");
    expect(aliases).toContain("network administrator");
    expect(aliases).toContain("infrastructure engineer");
  });

  it("reaches one hop across Primary-Short related occupations", () => {
    // 15-1211.00 is Primary-Short related to 15-1241.00 — its titles join the
    // family even though none of them contain "network engineer".
    const aliases = familyAliasesFor("network engineer");
    expect(aliases).toContain("public key infrastructure analyst");
  });

  it("returns aliases normalized to lowercase words", () => {
    for (const alias of familyAliasesFor("network engineer").slice(0, 50)) {
      expect(alias).toBe(alias.toLowerCase());
      expect(alias).not.toMatch(/[()]/);
    }
  });

  it("is case-insensitive about the query", () => {
    expect(familyAliasesFor("Network Engineer")).toEqual(familyAliasesFor("network engineer"));
  });

  it("returns empty for a keyword no occupation title contains", () => {
    expect(familySocCodesFor("flurbleblat wrangler")).toEqual([]);
    expect(familyAliasesFor("flurbleblat wrangler")).toEqual([]);
  });
});
