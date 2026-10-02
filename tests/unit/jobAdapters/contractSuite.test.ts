import { describe, expect, it } from "vitest";
import { runAdapterContractSuite, assertHonorsAbortSignal } from "@/lib/jobAdapters/testing/contractSuite";
import {
  ALL_FIXTURE_ADAPTERS,
  signalIgnoringAdapter,
} from "@/lib/jobAdapters/testing/fixtureAdapters";

// Every reference adapter must pass the exact same suite — this IS "a single
// parameterized test file that every adapter is run against automatically."
for (const adapter of ALL_FIXTURE_ADAPTERS) {
  runAdapterContractSuite(adapter);
}

describe("assertHonorsAbortSignal", () => {
  it("fails against an adapter that ignores ctx.signal (proves the check has teeth)", async () => {
    await expect(assertHonorsAbortSignal(signalIgnoringAdapter, { kind: "keywords", keywords: "HANG_TEST", location: null, remoteOnly: false, employmentType: "any" }, 100)).rejects.toThrow(
      /did not terminate/
    );
  });
});
