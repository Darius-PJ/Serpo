// The ONLY file allowed to import a concrete adapter. Every other file in this tree
// (and every consumer outside it) must go through the functions exported here —
// enforced by tests/unit/jobAdapters/noAdapterImportsOutsideRegistry.test.ts.
//
// All 11 original sources were migrated here (Phase 4/5 — see docs/architecture-audit.md
// and docs/decisions.md); the legacy lib/jobSources/ connector registry this replaced is
// gone. "Dynamic discovery" means discovered/filtered at call time (never cached
// across requests, config re-checked on every read) rather than Node runtime
// filesystem scanning — a literal fs.readdir + dynamic import() can't be statically
// bundled by Next.js's build, so it would work in dev and break in production.
// Adding a new source means adding one entry to the ADAPTERS array below — see
// docs/adding-a-source.md for the full checklist.
import type { Adapter } from "./types";
import { isAdapterConfigured } from "./config";
import { arbeitnowAdapter } from "./adapters/arbeitnow";
import { jobSpyAdapters } from "./adapters/jobspy";
import { remoteOkAdapter } from "./adapters/remoteok";
import { adzunaAdapter } from "./adapters/adzuna";
import { himalayasAdapter } from "./adapters/himalayas";
import { jobicyAdapter } from "./adapters/jobicy";
import { usaJobsAdapter } from "./adapters/usajobs";
import { joobleAdapter } from "./adapters/jooble";
import { greenhouseAdapter } from "./adapters/greenhouse";
import { leverAdapter } from "./adapters/lever";
import { careerjetAdapter } from "./adapters/careerjet";
import { ashbyAdapter } from "./adapters/ashby";
import { smartRecruitersAdapter } from "./adapters/smartrecruiters";

const ADAPTERS: Adapter[] = [
  arbeitnowAdapter,
  ...jobSpyAdapters,
  remoteOkAdapter,
  adzunaAdapter,
  himalayasAdapter,
  jobicyAdapter,
  usaJobsAdapter,
  joobleAdapter,
  greenhouseAdapter,
  leverAdapter,
  careerjetAdapter,
  ashbyAdapter,
  smartRecruitersAdapter,
];

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
