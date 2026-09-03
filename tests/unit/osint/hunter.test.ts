import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hunterConnector } from "@/lib/osint/hunter";

const fetchMock = vi.fn();

describe("hunter.io connector", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("HUNTER_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is unconfigured without HUNTER_API_KEY", () => {
    vi.stubEnv("HUNTER_API_KEY", "");
    expect(hunterConnector.isConfigured()).toBe(false);
  });

  it("is configured with a key", () => {
    expect(hunterConnector.isConfigured()).toBe(true);
  });

  it("maps domain-search emails to decision-maker results with name, title, and confidence", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          emails: [
            {
              value: "jordan.reyes@acme.test",
              first_name: "Jordan",
              last_name: "Reyes",
              position: "Engineering Manager",
              confidence: 93,
            },
            { value: "info@acme.test", first_name: null, last_name: null, position: null, confidence: null },
          ],
        },
      }),
    });

    const results = await hunterConnector.research("acme.test");

    expect(results).toEqual([
      {
        name: "Jordan Reyes",
        title: "Engineering Manager",
        email: "jordan.reyes@acme.test",
        sourceTool: "hunter",
        confidence: "hunter-confidence-93",
      },
      { email: "info@acme.test", sourceTool: "hunter" },
    ]);
  });

  it("sends the API key in a header, never in the URL", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { emails: [] } }) });
    await hunterConnector.research("acme.test");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("test-key");
    expect(init.headers["X-API-KEY"]).toBe("test-key");
  });

  it("surfaces an HTTP failure as an error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    await expect(hunterConnector.research("acme.test")).rejects.toThrow(/429/);
  });
});
