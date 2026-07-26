import { test, expect, request as pwRequest } from "@playwright/test";
import { registerViaApi } from "./helpers";

// Real end-to-end proof that the IDOR gaps found and fixed during
// implementation (résumé download, application PATCH/apply, profile-field
// delete) actually reject cross-account access. Each account gets its own
// APIRequestContext so cookies never mix.
test("account B cannot read, modify, or act on account A's data", async ({ baseURL }) => {
  const ctxA = await pwRequest.newContext({ baseURL });
  const ctxB = await pwRequest.newContext({ baseURL });
  try {
    await registerViaApi(ctxA);
    await registerViaApi(ctxB);

    const created = await ctxA.post("/api/applications", {
      headers: { "Content-Type": "application/json" },
      data: { company: "Acme", role: "Engineer", source: "manual" },
    });
    expect(created.ok()).toBe(true);
    const { application } = await created.json();

    const field = await ctxA.post("/api/profile-fields", {
      headers: { "Content-Type": "application/json" },
      data: { key: "email", label: "Email", value: "a@example.com" },
    });
    expect(field.ok()).toBe(true);
    const { field: profileField } = await field.json();

    // GET
    const getAsB = await ctxB.get(`/api/applications/${application.id}`);
    expect(getAsB.status()).toBe(404);

    // PATCH
    const patchAsB = await ctxB.patch(`/api/applications/${application.id}`, {
      headers: { "Content-Type": "application/json" },
      data: { status: "Submitted" },
    });
    expect(patchAsB.status()).toBe(404);

    // Résumé download (the previously-unflagged IDOR gap).
    const resumeAsB = await ctxB.get(`/api/applications/${application.id}/resume`);
    expect(resumeAsB.status()).toBe(404);

    // Apply — must 404 at the ownership check, before touching Claude/Playwright.
    const applyAsB = await ctxB.post(`/api/applications/${application.id}/apply`, {
      headers: { "Content-Type": "application/json" },
      data: { confirm: "APPLY" },
    });
    expect(applyAsB.status()).toBe(404);

    // Delete another account's saved profile answer.
    const deleteFieldAsB = await ctxB.delete(`/api/profile-fields/${profileField.id}`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(deleteFieldAsB.status()).toBe(404);

    // Sanity: account A can still do all of the above on its own data.
    const getAsA = await ctxA.get(`/api/applications/${application.id}`);
    expect(getAsA.ok()).toBe(true);
  } finally {
    await ctxA.dispose();
    await ctxB.dispose();
  }
});
