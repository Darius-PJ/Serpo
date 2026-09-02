import type { APIRequestContext } from "@playwright/test";

/** Clears the one local workspace so sequential E2E tests remain isolated. */
export async function resetWorkspace(request: APIRequestContext) {
  const response = await request.post("/api/privacy/purge", {
    headers: { "Content-Type": "application/json" },
    data: { action: "wipe-all", confirm: "WIPE" },
  });
  if (!response.ok()) {
    throw new Error(`resetWorkspace failed: ${response.status()} ${await response.text()}`);
  }
}