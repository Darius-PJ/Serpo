// The in-process scheduler. It exists only while the Serpo server runs:
// closing the app window or pressing Quit stops it with everything else, and
// nothing runs while Serpo is closed. Work that came due meanwhile runs once
// on the first tick after the next start.
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { JOB_HANDLERS } from "./handlers";
import { recoverStaleLocks, runDueJobs } from "./runner";
import { enqueueDue } from "./schedule";

const TICK_MS = 60_000;
// Finished jobs are history; their slot and day keys never recur. Dead jobs
// stay until the user retries them.
const DONE_JOB_RETENTION_MS = 30 * 24 * 60 * 60_000;

interface AutomationState {
  timer: NodeJS.Timeout | null;
  /** The queue drain in progress, if any. Jobs run one at a time. */
  draining: Promise<void> | null;
}

// On globalThis, not in module scope: instrumentation.ts and the route
// bundles load separate copies of this module, and dev hot reload re-runs it.
declare global {
  var __serpoAutomation: AutomationState | undefined;
}

function automationState(): AutomationState {
  globalThis.__serpoAutomation ??= { timer: null, draining: null };
  return globalThis.__serpoAutomation;
}

/**
 * Starts the ticker once per server process. Returns at once: the first
 * tick, the catch-up for everything that came due while Serpo was closed,
 * runs in the background so server start is never delayed.
 */
export function startAutomation(): void {
  const state = automationState();
  if (state.timer) return;
  state.timer = setInterval(() => void tick(), TICK_MS);
  // Never keep the process alive for the ticker's sake.
  state.timer.unref();
  void tick();
}

/**
 * One scheduler pass: return jobs orphaned by a server that died mid-job,
 * enqueue what came due, prune old history, then drain the queue. Never throws.
 */
export async function tick(): Promise<void> {
  const now = new Date();
  try {
    await recoverStaleLocks(now);
    await enqueueDue(now);
    await prisma.automationJob.deleteMany({
      where: { status: "done", finishedAt: { lt: new Date(now.getTime() - DONE_JOB_RETENTION_MS) } },
    });
  } catch (err) {
    console.error("[automation] scheduling failed", err);
  }
  await drainQueue();
}

// A drain already in progress claims jobs until none is due, so a second
// caller waits on it instead of running jobs alongside it.
function drainQueue(): Promise<void> {
  const state = automationState();
  state.draining ??= runDueJobs(JOB_HANDLERS)
    .then(() => undefined)
    .catch((err) => console.error("[automation] running jobs failed", err))
    .finally(() => {
      state.draining = null;
    });
  return state.draining;
}
