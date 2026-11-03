import "server-only";
import type { BackendApp } from "./mapping";

/**
 * The BFF's NATS settings, read from the environment and the files it
 * names (R9). A refusal names the setting only, never a value or a file's
 * contents.
 *
 *   NATS_URL             nats://… (development) or tls://…
 *   NATS_NKEY_SEED_FILE  the app's NKey user seed (SU…), a mounted secret
 *   NATS_USER, NATS_PASSWORD_FILE
 *                        development only (the backend's dev and smoke stacks)
 *   NATS_TLS_CA_FILE, NATS_TLS_CERT_FILE, NATS_TLS_KEY_FILE
 *                        required outside development
 *   MHAI_DEPLOY_ENV      "development" relaxes TLS and allows passwords
 */
export type NatsConfig = {
  servers: string;
  auth:
    | { kind: "nkey"; seed: Uint8Array }
    | { kind: "password"; user: string; pass: string };
  /** File paths. */
  tls: { ca: string; cert: string; key: string } | null;
  inboxPrefix: `_INBOX_bff.${BackendApp}`;
  name: `mhai-web-${BackendApp}`;
};

export type NatsConfigResult = NatsConfig | { refused: string };

type Env = Record<string, string | undefined>;

const USER = /^[A-Za-z0-9_-]{1,64}$/;
const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);

/** The bytes without trailing whitespace, as a copy; the input is zeroed. */
function trimmedCopy(buf: Buffer): Uint8Array {
  let end = buf.length;
  while (end > 0 && WHITESPACE.has(buf[end - 1]!)) end--;
  const out = new Uint8Array(end);
  out.set(buf.subarray(0, end));
  buf.fill(0);
  return out;
}

function readSeed(path: string, readFile: (p: string) => Buffer) {
  let bytes: Uint8Array;
  try {
    bytes = trimmedCopy(readFile(path));
  } catch {
    return null;
  }
  // Checked byte by byte, so the seed is never a JS string.
  if (bytes.length !== 58) return wipe(bytes);
  if (bytes[0] !== 0x53 || bytes[1] !== 0x55) return wipe(bytes); // "SU"
  for (let i = 2; i < bytes.length; i++) {
    const c = bytes[i]!;
    const base32 = (c >= 0x41 && c <= 0x5a) || (c >= 0x32 && c <= 0x37);
    if (!base32) return wipe(bytes);
  }
  return bytes;
}

function wipe(b: Uint8Array): null {
  b.fill(0);
  return null;
}

function readable(path: string, readFile: (p: string) => Buffer): boolean {
  try {
    readFile(path).fill(0);
    return true;
  } catch {
    return false;
  }
}

/** A server URL without credentials: nats:// (development only) or tls://. */
function serversOk(url: string, dev: boolean): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === "tls:") return true;
  return dev && u.protocol === "nats:";
}

export function readNatsConfig(
  app: BackendApp,
  env: Env,
  readFile: (p: string) => Buffer,
): NatsConfigResult {
  if (app !== "clinical" && app !== "platform") return { refused: "app" };
  const dev = env.MHAI_DEPLOY_ENV === "development";

  const servers = env.NATS_URL ?? "";
  if (!servers || !serversOk(servers, dev)) return { refused: "NATS_URL" };

  const seedFile = env.NATS_NKEY_SEED_FILE;
  const user = env.NATS_USER;
  const passFile = env.NATS_PASSWORD_FILE;
  const password = Boolean(user || passFile);
  if (seedFile && password) return { refused: "NATS_NKEY_SEED_FILE|NATS_USER" };

  let auth: NatsConfig["auth"];
  if (seedFile) {
    const seed = readSeed(seedFile, readFile);
    if (!seed) return { refused: "NATS_NKEY_SEED_FILE" };
    auth = { kind: "nkey", seed };
  } else if (password) {
    if (!dev || !user || !USER.test(user)) return { refused: "NATS_USER" };
    if (!passFile) return { refused: "NATS_PASSWORD_FILE" };
    let pass: string;
    try {
      pass = new TextDecoder().decode(trimmedCopy(readFile(passFile)));
    } catch {
      return { refused: "NATS_PASSWORD_FILE" };
    }
    if (!pass) return { refused: "NATS_PASSWORD_FILE" };
    auth = { kind: "password", user, pass };
  } else {
    return { refused: "NATS_NKEY_SEED_FILE" };
  }

  const tlsFiles = {
    NATS_TLS_CA_FILE: env.NATS_TLS_CA_FILE,
    NATS_TLS_CERT_FILE: env.NATS_TLS_CERT_FILE,
    NATS_TLS_KEY_FILE: env.NATS_TLS_KEY_FILE,
  };
  const given = Object.values(tlsFiles).filter(Boolean).length;
  let tls: NatsConfig["tls"] = null;
  if (!dev || given > 0) {
    for (const [name, path] of Object.entries(tlsFiles))
      if (!path || !readable(path, readFile)) {
        if (auth.kind === "nkey") auth.seed.fill(0);
        return { refused: name };
      }
    tls = {
      ca: tlsFiles.NATS_TLS_CA_FILE!,
      cert: tlsFiles.NATS_TLS_CERT_FILE!,
      key: tlsFiles.NATS_TLS_KEY_FILE!,
    };
  }

  return {
    servers,
    auth,
    tls,
    inboxPrefix: `_INBOX_bff.${app}`,
    name: `mhai-web-${app}`,
  };
}
