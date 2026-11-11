import "server-only";
import crypto from "crypto";

/**
 * Envelope for provider credentials at rest (AES-256-GCM).
 *
 * Stored format: `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 * Values without the prefix are treated as legacy plaintext so existing rows
 * keep working; they are re-encrypted the next time they are written.
 *
 * Key: `TOKEN_ENCRYPTION_KEY`, 32 bytes as base64 or 64 hex chars.
 * Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * If the key is missing, values are stored as-is and a warning is logged once,
 * so local development without the key still works.
 */
const PREFIX = "enc:v1:";
let warned = false;

function key(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (!warned && process.env.NODE_ENV === "production") {
      console.warn("TOKEN_ENCRYPTION_KEY is not set: provider tokens are stored unencrypted.");
    }
    warned = true;
    return null;
  }
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return buf;
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  const k = key();
  if (!k) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const k = key();
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY is required to read encrypted credentials");
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]).toString("utf8");
}

/** Signed, expiring value for the OAuth `state` parameter (CSRF protection). */
export function signState(payload: Record<string, unknown>, ttlSeconds = 600): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds, n: crypto.randomBytes(8).toString("hex") }),
  ).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyState<T extends Record<string, unknown>>(state: string | null): T | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
  if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
  return data;
}

function hmac(body: string) {
  const secret =
    process.env.OAUTH_STATE_SECRET ?? process.env.TOKEN_ENCRYPTION_KEY ?? process.env.AURINKO_CLIENT_SECRET;
  if (!secret) throw new Error("Set OAUTH_STATE_SECRET (or TOKEN_ENCRYPTION_KEY) to sign OAuth state");
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}
