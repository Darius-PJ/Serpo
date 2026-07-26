import "server-only";
import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Rejects requests that don't look like same-origin JSON fetch() calls.
 *
 * Without this, a cross-origin HTML form (enctype="text/plain", body crafted
 * to parse as JSON) can hit any mutating route with no CORS preflight and no
 * credentials required — a classic blind CSRF against local apps. Requiring
 * an exact `application/json` Content-Type blocks that trick outright, since
 * text/plain forms can't set it without triggering a preflight our server
 * would then refuse (no CORS headers are sent). Origin/size checks are
 * defense in depth on top of that.
 */
export function requireJsonRequest(request: Request): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  // Compare Origin against the Host header the client actually connected
  // to, not new URL(request.url).origin — in Next's dev server that gets
  // internally reconstructed as "localhost" even when bound to 127.0.0.1
  // (this app's own dev/start scripts use -H 127.0.0.1), which made every
  // legitimate same-origin request 403 whenever the app was opened via
  // http://127.0.0.1:*.
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // fall through — originHost stays null, treated as a mismatch below
    }
    if (!host || originHost !== host) {
      return NextResponse.json({ error: "cross-origin request rejected" }, { status: 403 });
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "request body too large" }, { status: 413 });
  }

  return null;
}
