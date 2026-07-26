import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { signSessionToken, verifySessionToken } from "./jwt";

export { signSessionToken, verifySessionToken } from "./jwt";
export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — a local single-machine app, long-lived login is fine

// This app's own "production" (`next start -H 127.0.0.1`) is still plain
// HTTP, not TLS — deriving `secure` from NODE_ENV would silently break
// login. Set COOKIE_SECURE=true only once this is actually served over HTTPS.
function cookieSecure() {
  return process.env.COOKIE_SECURE === "true";
}

export async function createSession(userId: string) {
  const token = await signSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// Memoized per request/render pass (React's DAL pattern) so multiple
// Server Components/Route Handler helpers reading the session in the same
// request don't each re-verify the JWT.
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  return session?.userId ?? null;
});

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}

/** For Route Handlers: throws UnauthorizedError instead of returning null, so callers can let it propagate into a 401. */
export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

/** For Server Components/pages: redirects to /login instead of returning null. Proxy already does this optimistically; this is the DAL-level enforcement Next recommends alongside it. */
export async function requireUserIdForPage(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  return userId;
}

/**
 * Route-handler auth guard mirroring lib/security/guard.ts's requireJsonRequest
 * shape: returns the userId on success, or a 401 NextResponse to return
 * immediately. Proxy already blocks unauthenticated /api/* requests, but each
 * Route Handler re-checks independently rather than relying on Proxy alone.
 */
export async function requireApiUserId(): Promise<string | NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return userId;
}
