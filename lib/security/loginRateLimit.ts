import "server-only";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_ENTRIES = 10_000;

type Attempt = { failures: number; expiresAt: number };
const attempts = new Map<string, Attempt>();

export function loginRateLimitKey(request: Request, username: string) {
  // This is transient process memory only; no IP address or username is persisted.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "local"}:${username}`;
}

export function loginRetryAfterSeconds(key: string, now = Date.now()): number | null {
  const attempt = attempts.get(key);
  if (!attempt || attempt.expiresAt <= now) {
    attempts.delete(key);
    return null;
  }
  return attempt.failures >= MAX_FAILURES ? Math.ceil((attempt.expiresAt - now) / 1000) : null;
}

export function recordLoginFailure(key: string, now = Date.now()) {
  if (attempts.size >= MAX_ENTRIES) {
    for (const [candidate, attempt] of attempts) {
      if (attempt.expiresAt <= now) attempts.delete(candidate);
    }
  }
  const previous = attempts.get(key);
  const expiresAt = previous && previous.expiresAt > now ? previous.expiresAt : now + WINDOW_MS;
  attempts.set(key, { failures: previous && previous.expiresAt > now ? previous.failures + 1 : 1, expiresAt });
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}

export function resetLoginRateLimitForTests() {
  attempts.clear();
}
