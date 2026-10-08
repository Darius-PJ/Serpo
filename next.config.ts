import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { assertCwdCasing } from "./scripts/assertCwdCasing.mjs";

const nextConfig: NextConfig = {
  // The dev-tools badge defaults to bottom-left, where it sits on top of the
  // sidebar's collapse button; bottom-right is empty page margin.
  devIndicators: { position: "bottom-right" },
  turbopack: {
    // lib/db/prisma.ts (SQLite path) and lib/jobAdapters/adapters/jobspy/index.ts
    // (Python script path) resolve paths from process.cwd() at runtime — a
    // necessary pattern for this local app. Turbopack's file tracer can't follow
    // process.cwd() statically, so it warns that the "whole project was traced"
    // into the NFT manifest. That manifest only matters for output:'standalone'
    // /serverless bundles, which this app doesn't use (it runs via `next start`),
    // so the warning is benign here. A `turbopackIgnore` comment does NOT apply to
    // this warning (that's for dynamic-import bundling); turbopack.ignoreIssue is
    // the documented mechanism. Scoped by title so only this known warning is
    // hidden — real issues from next.config.ts still surface.
    ignoreIssue: [{ path: /next\.config\.ts$/, title: "Encountered unexpected file in NFT list" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default function config(phase: string): NextConfig {
  // Only the build is known to break on a mis-cased cwd; dev and start are left alone.
  if (phase === PHASE_PRODUCTION_BUILD) assertCwdCasing("next build");
  return nextConfig;
}
