import { realpathSync } from "node:fs";

// Windows accepts any casing of a path, but Node keys its module cache by the
// path string. Run from a cwd whose casing differs from the folder on disk
// (e.g. ...\documents\ vs ...\Documents\), `next build` fails with the cryptic
// "InvariantError: Expected workStore to be initialized", and Playwright with
// "did not expect test() to be called here". Fail first with the real fix.
export function assertCwdCasing(tool) {
  const cwd = process.cwd();
  const onDisk = realpathSync.native(cwd);
  // Same path, different casing only: symlinked checkouts resolve elsewhere and pass.
  if (onDisk !== cwd && onDisk.toLowerCase() === cwd.toLowerCase()) {
    throw new Error(
      `${tool} must run from the project folder's on-disk casing.\n` +
        `  current: ${cwd}\n` +
        `  on disk: ${onDisk}\n` +
        `cd to the "on disk" path (or start your terminal there) and rerun.`,
    );
  }
}
