import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Enforces the Phase 3 rule: "core code may import the registry; core code may never
// import a specific adapter" (docs/architecture-audit.md's own work queue, §3).
// registry.ts is the one sanctioned exception. Nothing under lib/jobAdapters/adapters/**
// exists yet (that's Phase 4) — this test is deliberately in place *before* that
// directory exists, so the very first adapter added is already covered, not
// retrofitted later.
const JOB_ADAPTERS_ROOT = path.join(process.cwd(), "lib", "jobAdapters");
const ADAPTER_IMPORT_PATTERN = /from\s+["'][^"']*\/adapters\/[^"']*["']/;
const FIXTURE_ADAPTER_IMPORT_PATTERN = /from\s+["'][^"']*testing\/fixtureAdapters["']/;

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(fullPath)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("core never imports a concrete adapter outside registry.ts", () => {
  it("no file other than registry.ts imports from an adapters/ directory", async () => {
    const files = await listTsFiles(JOB_ADAPTERS_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      if (path.basename(file) === "registry.ts") continue;
      const content = await readFile(file, "utf-8");
      if (ADAPTER_IMPORT_PATTERN.test(content)) violations.push(file);
    }

    expect(violations).toEqual([]);
  });

  it("no file outside testing/ imports the fixture/reference adapters directly", async () => {
    const files = await listTsFiles(JOB_ADAPTERS_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      if (file.includes(`${path.sep}testing${path.sep}`)) continue;
      const content = await readFile(file, "utf-8");
      if (FIXTURE_ADAPTER_IMPORT_PATTERN.test(content)) violations.push(file);
    }

    expect(violations).toEqual([]);
  });
});
