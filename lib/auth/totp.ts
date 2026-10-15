/** One-time codes as authenticator apps make them (RFC 6238 over RFC 4226, HMAC-SHA1). */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[i++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

export async function totp(
  secretBase32: string,
  timeMs: number,
  { step = 30, digits = 6 }: { step?: number; digits?: number } = {},
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secretBase32),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const off = h[h.length - 1]! & 0x0f;
  const bin =
    ((h[off]! & 0x7f) << 24) |
    (h[off + 1]! << 16) |
    (h[off + 2]! << 8) |
    h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Accepts the current step and `window` steps either side (clock drift). */
export async function verifyTotp(
  secretBase32: string,
  code: string,
  timeMs: number,
  window = 1,
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  for (let w = -window; w <= window; w++)
    if ((await totp(secretBase32, timeMs + w * 30_000)) === code) return true;
  return false;
}
