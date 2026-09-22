import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

interface Reservation { until: number; reason: string }
interface SchedulerState {
  tail: Promise<unknown>;
  pending: Map<string, Promise<unknown>>;
  reservations: Record<string, Reservation>;
  loaded: boolean;
}

// One local Serpo server; survives Next dev reloads. Cooldowns also survive restarts.
const globalState = globalThis as typeof globalThis & { __serpoScrapeScheduler?: SchedulerState };
const state: SchedulerState = globalState.__serpoScrapeScheduler ??= {
  tail: Promise.resolve(), pending: new Map(), reservations: {}, loaded: false,
};

export class ScrapePausedError extends Error {
  constructor(public retryAt: number, reason: string) {
    super(`${reason} Paused until ${new Date(retryAt).toLocaleTimeString()}.`);
    this.name = "ScrapePausedError";
  }
}

export function positiveSetting(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function statePath() {
  const dbFile = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/app.db";
  return path.resolve(`${dbFile}.jobspy-state.json`);
}

async function load() {
  if (state.loaded) return;
  try {
    const saved = JSON.parse(await readFile(statePath(), "utf8"));
    for (const [site, value] of Object.entries(saved)) {
      const row = value as Reservation;
      if (typeof row?.until === "number" && Number.isFinite(row.until) && typeof row.reason === "string") state.reservations[site] = row;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Cannot read JobSpy request limits; search paused to avoid excess requests.");
  }
  state.loaded = true;
}

async function save() {
  const file = statePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(state.reservations), "utf8");
  await rename(`${file}.tmp`, file);
}

export async function scheduleScrape<T>(options: {
  site: string; key: string; minIntervalMs: number;
  getSignal: () => AbortSignal;
  run: (signal: AbortSignal) => Promise<T>;
  cooldown: (result: T) => { milliseconds: number; reason: string } | null;
}): Promise<T> {
  const key = `${options.site}:${options.key}`;
  const pending = state.pending.get(key);
  if (pending) return pending as Promise<T>;
  const task = state.tail.then(async () => {
    const signal = options.getSignal();
    signal.throwIfAborted();
    await load();
    const previous = state.reservations[options.site];
    if (previous && previous.until > Date.now()) throw new ScrapePausedError(previous.until, previous.reason);
    // Persist before making requests, including on crashes/timeouts.
    state.reservations[options.site] = { until: Date.now() + options.minIntervalMs, reason: "Requests are spaced out to reduce blocking." };
    await save();
    signal.throwIfAborted();
    const result = await options.run(signal);
    state.reservations[options.site].until = Date.now() + options.minIntervalMs;
    const pause = options.cooldown(result);
    if (pause) {
      state.reservations[options.site] = {
        until: Math.max(state.reservations[options.site].until, Date.now() + pause.milliseconds), reason: pause.reason,
      };
    }
    await save();
    return result;
  });
  state.pending.set(key, task);
  state.tail = task.catch(() => undefined);
  try { return await task; }
  finally { state.pending.delete(key); }
}

export function resetScrapeSchedulerForTests() {
  state.tail = Promise.resolve();
  state.pending.clear();
  state.reservations = {};
  state.loaded = false;
}
