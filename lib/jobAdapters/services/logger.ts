// Minimal structured logger — no dependency added (this app has no pino/winston and
// standing rule is "no new dependencies without asking"). Emits one JSON line per call
// so it's greppable/parseable by any future log aggregator without committing to one
// now. This is the first structured logging anywhere in the job-source pipeline —
// docs/architecture-audit.md §8 found zero existing observability to build on.
import type { Logger } from "../types";

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, bindings: Record<string, unknown>, fields?: Record<string, unknown>): void {
  const line = {
    level,
    message,
    time: new Date().toISOString(),
    ...bindings,
    ...fields,
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

// bindings (e.g. correlationId, sourceId) are attached to every call made through the
// returned logger, so a caller never has to repeat them per log line.
export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (message, fields) => emit("debug", message, bindings, fields),
    info: (message, fields) => emit("info", message, bindings, fields),
    warn: (message, fields) => emit("warn", message, bindings, fields),
    error: (message, fields) => emit("error", message, bindings, fields),
  };
}
