import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "@/lib/jobAdapters/services/httpClient";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({}), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithRetry", () => {
  it("returns immediately on a successful response, no retries", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await fetchWithRetry("https://example.com", {}, { signal: new AbortController().signal, logger: noopLogger });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns a non-retryable 4xx immediately rather than retrying", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(404));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await fetchWithRetry("https://example.com", {}, { signal: new AbortController().signal, logger: noopLogger });

    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff, then succeeds", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse(500)).mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await fetchWithRetry("https://example.com", { maxRetries: 2 }, { signal: new AbortController().signal, logger: noopLogger });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries against a persistently failing source", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      fetchWithRetry("https://example.com", { maxRetries: 1 }, { signal: new AbortController().signal, logger: noopLogger })
    ).rejects.toThrow("network down");
    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial attempt + 1 retry
  });
});
