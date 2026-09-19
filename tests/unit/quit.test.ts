import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/app/quit/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (origin = "http://127.0.0.1:3000", host = "127.0.0.1:3000") => new Request("http://127.0.0.1:3000/api/app/quit", {
  method: "POST", headers: { "Content-Type": "application/json", origin, host }, body: "{}",
});

describe("local Quit route", () => {
  it("rejects cross-origin, missing-origin, and non-loopback requests", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request("https://other.example"))).status).toBe(403);
    expect((await POST(request(""))).status).toBe(403);
    expect((await POST(request("http://other.example:3000", "other.example:3000"))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not terminate manually started or pre-update servers", async () => {
    vi.stubEnv("SERPO_CONTROL_PORT", ""); vi.stubEnv("SERPO_CONTROL_TOKEN", "");
    expect((await POST(request())).status).toBe(409);
  });
  it("asks only the authenticated local supervisor to quit", async () => {
    vi.stubEnv("SERPO_CONTROL_PORT", "3999"); vi.stubEnv("SERPO_CONTROL_TOKEN", "test-secret");
    const fetch = vi.fn(async () => new Response("{}", { status: 202 })); vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3999/quit", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer test-secret" } }));
    expect(await response.json()).toEqual({ stopping: true });
  });
  it("reports controller failure without falsely claiming shutdown", async () => {
    vi.stubEnv("SERPO_CONTROL_PORT", "3999"); vi.stubEnv("SERPO_CONTROL_TOKEN", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await POST(request())).status).toBe(503);
  });
});
