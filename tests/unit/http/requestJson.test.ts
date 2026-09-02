import { describe, expect, it } from "vitest";
import { ApiRequestError, requestJson } from "@/lib/http/requestJson";

describe("requestJson", () => {
  it("returns parsed JSON for a successful mutation", async () => {
    const result = await requestJson<{ ok: boolean }>("/api/example", {}, async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    expect(result).toEqual({ ok: true });
  });

  it("throws the API error message for a rejected mutation", async () => {
    const promise = requestJson("/api/example", {}, async () =>
      new Response(JSON.stringify({ error: "Could not save the task" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(promise).rejects.toEqual(expect.objectContaining<ApiRequestError>({
      name: "ApiRequestError",
      message: "Could not save the task",
      status: 422,
    }));
  });

  it("uses a stable fallback when the server response is not JSON", async () => {
    await expect(
      requestJson("/api/example", {}, async () => new Response("gateway failure", { status: 502 }))
    ).rejects.toThrow("Request failed (502)");
  });
});
