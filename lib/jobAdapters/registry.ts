// The ONLY file allowed to import a concrete adapter. Every other file in this tree
// (and every consumer outside it) must go through the functions exported here —
// enforced by tests/unit/jobAdapters/noAdapterImportsOutsideRegistry.test.ts.
//
// Empty until Phase 4 migrates the first real source. "Dynamic discovery" here means
// discovered/filtered at call time (never cached across requests, config re-checked
// on every read) rather than Node runtime filesystem scanning — a literal fs.readdir +
// dynamic import() can't be statically bundled by Next.js's build, so it would work in
// dev and break in production. Adding an adapter later means adding one entry to the
// ADAPTERS array below — a single, explicit registration point, same shape as today's
// lib/jobSources/index.ts's CONNECTORS array (see docs/architecture-audit.md §3).
import type { Adapter } from "./types";
import { isAdapterConfigured } from "./config";
import { arbeitnowAdapter } from "./adapters/arbeitnow";
import { jobSpyAdapter } from "./adapters/jobspy";
import { remoteOkAdapter } from "./adapters/remoteok";

const ADAPTERS: Adapter[] = [arbeitnowAdapter, jobSpyAdapter, remoteOkAdapter];

export function listAdapters(): Adapter[] {
  return ADAPTERS;
}

export function listConfiguredAdapters(): Adapter[] {
  return ADAPTERS.filter((adapter) => isAdapterConfigured(adapter));
}

export function findAdapterById(id: string): Adapter | undefined {
  return ADAPTERS.find((adapter) => adapter.metadata.id === id);
}

export function listEnumerateTargetAdapters(): Adapter[] {
  return ADAPTERS.filter((adapter) => adapter.capabilities.queryModel === "enumerate-target");
}
