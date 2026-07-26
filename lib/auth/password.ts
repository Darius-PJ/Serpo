import "server-only";
import bcrypt from "bcryptjs";

// bcrypt (all implementations, including bcryptjs) silently truncates input
// at 72 bytes — bounding password length here makes that an explicit, known
// limit instead of a silent footgun for very long passphrases.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Pure-JS bcrypt is noticeably slower per round than the native binding —
// 11 keeps login latency reasonable on modest hardware while still being
// well above the now-outdated cost-10 baseline.
const BCRYPT_COST = 11;

export function isValidPasswordLength(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
