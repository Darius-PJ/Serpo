// Loads a captured live-response fixture (see docs/architecture-audit.md's Phase 1
// fixture inventory) for replay through MSW in characterization tests.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { JsonBodyType } from "msw";

export interface LoadedFixture {
  status: number;
  // JsonBodyType (not unknown) so callers can pass this straight to MSW's
  // HttpResponse.json() without a cast — every fixture body originated from a real
  // JSON.parse of a captured HTTP response, so this is a description of what's
  // already true, not a weakening of a check.
  body: JsonBodyType;
}

export function loadFixture(source: string, name: string): LoadedFixture {
  const filePath = path.join(__dirname, source, `${name}.json`);
  const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
  if (typeof parsed.status !== "number") {
    throw new Error(`${source}/${name}.json has no captured HTTP status — is this a metadata-only fixture (e.g. UNCONFIGURED.json)?`);
  }
  return { status: parsed.status, body: parsed.body };
}
