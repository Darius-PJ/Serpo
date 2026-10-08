import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeStartupProgress(progressPath, status) {
  if (!progressPath) return;
  let temporaryPath;
  try {
    temporaryPath = `${progressPath}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(progressPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(status)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporaryPath, progressPath);
  } catch {
    // Startup progress is advisory; it must never change setup or launch behavior.
  } finally {
    if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => {});
  }
}
