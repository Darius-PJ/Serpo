// The SSRF guard makes the browse-only happy path unreachable in e2e (a
// loopback URL can no longer be created or fetched), so the pool-status
// decision is covered here with injected search/fetch deps instead.
import { describe, expect, it } from "vitest";
import { verifyBoardForPool } from "@/lib/jobBoards/poolVerification";

function fakeAdapter(id: string, token: string | null) {
  return { metadata: { id }, detectTarget: () => token };
}

describe("verifyBoardForPool", () => {
  it("marks a recognized ATS board live after a successful verification search", async () => {
    const result = await verifyBoardForPool("https://boards.greenhouse.io/acme", [fakeAdapter("greenhouse", "acme")], {
      searchTarget: async () => ({ errors: [] }),
      fetchUrl: async () => {
        throw new Error("must not fetch for ATS boards");
      },
    });
    expect(result).toEqual({ poolStatus: "live", integrationType: "greenhouse", integrationToken: "acme" });
  });

  it("marks a recognized ATS board failed when the verification search errors", async () => {
    const result = await verifyBoardForPool("https://boards.greenhouse.io/acme", [fakeAdapter("greenhouse", "acme")], {
      searchTarget: async () => ({ errors: [{ message: "upstream 500" }] }),
      fetchUrl: async () => {
        throw new Error("must not fetch for ATS boards");
      },
    });
    expect(result).toEqual({ poolStatus: "failed", integrationType: null, integrationToken: null });
  });

  it("marks an unrecognized board browse-only when reachable — never live", async () => {
    const result = await verifyBoardForPool("https://jobs.example.gov", [fakeAdapter("greenhouse", null)], {
      searchTarget: async () => {
        throw new Error("must not run a search for unrecognized boards");
      },
      fetchUrl: async () => ({ ok: true }),
    });
    expect(result).toEqual({ poolStatus: "browse-only", integrationType: null, integrationToken: null });
  });

  it("marks an unrecognized board failed when unreachable or blocked", async () => {
    const notOk = await verifyBoardForPool("https://jobs.example.gov", [], {
      searchTarget: async () => ({ errors: [] }),
      fetchUrl: async () => ({ ok: false }),
    });
    expect(notOk.poolStatus).toBe("failed");

    const throws = await verifyBoardForPool("https://jobs.example.gov", [], {
      searchTarget: async () => ({ errors: [] }),
      fetchUrl: async () => {
        throw new Error("resolved to a private address");
      },
    });
    expect(throws.poolStatus).toBe("failed");
  });

  it("uses the first adapter that recognizes the URL", async () => {
    const miss = fakeAdapter("greenhouse", null);
    const hit = fakeAdapter("lever", "acme-inc");
    const result = await verifyBoardForPool("https://jobs.lever.co/acme-inc", [miss, hit], {
      searchTarget: async (adapter) =>
        adapter.metadata.id === "lever" ? { errors: [] } : { errors: [{ message: "wrong adapter" }] },
      fetchUrl: async () => ({ ok: true }),
    });
    expect(result).toEqual({ poolStatus: "live", integrationType: "lever", integrationToken: "acme-inc" });
  });
});
