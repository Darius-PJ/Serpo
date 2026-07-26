import { describe, it, expect } from "vitest";
import { requireJsonRequest } from "@/lib/security/guard";

function fakeRequest(headers: Record<string, string>): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

describe("requireJsonRequest", () => {
  it("rejects non-JSON content-type", () => {
    const res = requireJsonRequest(fakeRequest({ "content-type": "text/plain" }));
    expect(res?.status).toBe(415);
  });

  it("allows a same-origin JSON request", () => {
    const res = requireJsonRequest(
      fakeRequest({ "content-type": "application/json", origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" })
    );
    expect(res).toBeNull();
  });

  it("rejects a mismatched origin/host (regression: must compare Origin to Host, not to a reconstructed request.url)", () => {
    const res = requireJsonRequest(
      fakeRequest({ "content-type": "application/json", origin: "http://evil.example", host: "127.0.0.1:3000" })
    );
    expect(res?.status).toBe(403);
  });

  it("allows a request with no Origin header at all (non-browser clients)", () => {
    const res = requireJsonRequest(fakeRequest({ "content-type": "application/json" }));
    expect(res).toBeNull();
  });

  it("rejects an oversized body per Content-Length", () => {
    const res = requireJsonRequest(
      fakeRequest({ "content-type": "application/json", "content-length": String(100 * 1024) })
    );
    expect(res?.status).toBe(413);
  });
});
