/*
 * Threat model for the offline outbox:
 *
 * - The key can't be exported or read as bytes, so the stored items are
 *   unreadable outside this site's code in this browser profile.
 * - Someone who can run this site's code in the same browser profile could
 *   still decrypt them. Owner binding hides items from other users in the
 *   UI, and the 72 h TTL bounds how long anything sits on a shared ward PC.
 */
import { idbGet, idbPut } from "./db";

const KEY_ID = "device-key-v1";

/** A non-extractable AES-GCM key, created once and kept in IndexedDB. */
export async function deviceKey(): Promise<CryptoKey> {
  const found = await idbGet<CryptoKey>("keys", KEY_ID);
  if (found) return found;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await idbPut("keys", key, KEY_ID);
  return key;
}

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

export async function encrypt(value: unknown, key: CryptoKey): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { iv, data };
}

export async function decrypt<T>(s: Sealed, key: CryptoKey): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: s.iv },
    key,
    s.data,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** The owner as a hash, so no plain username is written to disk. */
export async function ownerId(username: string): Promise<string> {
  const h = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`mhai-outbox:${username}`),
  );
  return [...new Uint8Array(h)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
