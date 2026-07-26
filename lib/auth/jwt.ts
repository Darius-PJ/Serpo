import "server-only";
import { SignJWT, jwtVerify } from "jose";

// Pure JWT sign/verify logic, deliberately free of any next/headers or
// next/navigation import — those require a live Next.js request context and
// can't be exercised from a plain unit test. Kept separate so this part is
// directly testable.
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — a local single-machine app, long-lived login is fine

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set — see .env.example");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
