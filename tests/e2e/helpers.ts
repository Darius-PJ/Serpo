import type { APIRequestContext } from "@playwright/test";

export function randomUsername(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const E2E_PASSWORD = "e2e-test-password-123";

/** Registers a fresh account through the real API and leaves the session cookie set on the given context. */
export async function registerViaApi(request: APIRequestContext, username = randomUsername("e2e")) {
  const res = await request.post("/api/auth/register", {
    headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3100" },
    data: { username, password: E2E_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`registerViaApi failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return { username, userId: body.user.id as string };
}
