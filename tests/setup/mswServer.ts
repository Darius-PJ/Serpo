// Shared MSW (Mock Service Worker) server for characterization tests — intercepts at
// the native fetch/undici level, which is what every job-source connector in this app
// uses directly (docs/decisions.md explains why MSW was chosen over nock/Polly.js).
// Scoped per test file (each characterization test file calls start/stop itself),
// not global, so it never interferes with other tests' own fetch stubbing
// (e.g. tests/unit/jobAdapters/services/httpClient.test.ts's vi.stubGlobal("fetch", ...)).
import { setupServer } from "msw/node";

export const mswServer = setupServer();

export function startMswServer(): void {
  mswServer.listen({ onUnhandledRequest: "error" });
}

export function stopMswServer(): void {
  mswServer.close();
}

export function resetMswHandlers(): void {
  mswServer.resetHandlers();
}
