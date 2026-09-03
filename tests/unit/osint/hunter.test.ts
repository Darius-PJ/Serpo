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

    const results = await hunterConnector.research({ domain: "acme.test" });

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
    await hunterConnector.research({ domain: "acme.test" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("test-key");
    expect(init.headers["X-API-KEY"]).toBe("test-key");
  });

  it("searches by company name when no domain is known", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { emails: [] } }) });
    await hunterConnector.research({ company: "Acme Rockets Inc" });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("company")).toBe("Acme Rockets Inc");
    expect(url.searchParams.get("domain")).toBeNull();
  });

  it("rejects a query with neither domain nor company", async () => {
    await expect(hunterConnector.research({})).rejects.toThrow(/domain or company/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an HTTP failure as an error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    await expect(hunterConnector.research({ domain: "acme.test" })).rejects.toThrow(/429/);
  });
});
