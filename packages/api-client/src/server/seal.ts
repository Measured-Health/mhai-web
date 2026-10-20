import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Sealed cookies: AES-256-GCM with the key sha256(secret), stored as
 * base64url(iv 12 bytes | tag 16 bytes | ciphertext). Server only.
 */

function key(secret: string): Buffer {
  if (secret.length < 32) throw new Error("secret too short");
  return createHash("sha256").update(secret).digest();
}

/** `seal`, synchronously (for callers that seal outside an async function). */
export function sealSync(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([
    c.update(JSON.stringify(value), "utf8"),
    c.final(),
  ]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** `unseal`, synchronously. A missing value is none. */
export function unsealSync<T>(
  sealed: string | undefined,
  secret: string,
): T | null {
  const k = key(secret); // outside the try: a short secret must throw
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    // 12 IV + 16 tag + at least 1 byte of ciphertext.
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12), {
      authTagLength: 16,
    });
    d.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([
      d.update(raw.subarray(28)),
      d.final(),
    ]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function seal(value: unknown, secret: string): Promise<string> {
  return sealSync(value, secret);
}

/** Null for anything tampered with, truncated or sealed with another secret. */
export async function unseal<T>(
  sealed: string,
  secret: string,
): Promise<T | null> {
  return unsealSync<T>(sealed, secret);
}
