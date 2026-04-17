/**
 * Helpers for the per-candidate token + anonymous-ID system.
 *
 * Tokens look like FAM-XXXX where XXXX is drawn from an unambiguous
 * alphanumeric alphabet (no 0/O, 1/I/l).
 *
 * Anonymous IDs follow Excel column naming: A, B, ..., Z, AA, AB, ...
 * Up to 702 candidates per assessment (AA–ZZ); plenty for a 30-person cohort.
 */

import { randomBytes } from "node:crypto";

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars

export function generateTokenSuffix(length = 4): string {
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[buf[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

export function generateToken(prefix: string): string {
  return `${prefix.toUpperCase()}-${generateTokenSuffix(4)}`;
}

/**
 * Index → "A", "B", ..., "Z", "AA", "AB", ...
 * 0  → "A"
 * 25 → "Z"
 * 26 → "AA"
 * 27 → "AB"
 */
export function indexToLetter(index: number): string {
  if (index < 0) throw new Error("index must be >= 0");
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function indexToAnonymousId(index: number): string {
  return `Candidate ${indexToLetter(index)}`;
}

/**
 * Inverse of indexToLetter. "A" → 0, "Z" → 25, "AA" → 26, "AD" → 29.
 */
export function letterToIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    if (ch < "A" || ch > "Z") return -1;
    n = n * 26 + (ch.charCodeAt(0) - 64); // A=1
  }
  return n - 1;
}

/**
 * "Candidate AD" → 29. Returns -1 if the input doesn't match.
 */
export function anonymousIdToIndex(anon: string): number {
  const m = anon.match(/^Candidate\s+([A-Z]+)$/);
  if (!m) return -1;
  return letterToIndex(m[1]);
}

/**
 * SHA-256 hash of an IP address, hex-encoded. Used to roughly detect when a
 * second browser tries to use a token already started elsewhere — without
 * storing the raw IP in the database.
 */
import { createHash } from "node:crypto";
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Generate a per-session secret stored in a candidate cookie + DB. First
 * browser to start the assessment sets this; later attempts that present
 * a different cookie are rejected.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}
