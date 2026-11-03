// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readNatsConfig, type NatsConfig } from "./config";

// A syntactically valid user seed (base32, 58 characters), made up for tests.
const SEED = `SU${"A".repeat(56)}`;

function files(map: Record<string, string>) {
  return (p: string) => {
    if (!(p in map)) throw new Error(`ENOENT: ${p}`);
    return Buffer.from(map[p]!);
  };
}

const DEV = { MHAI_DEPLOY_ENV: "development" };
const TLS = {
  NATS_TLS_CA_FILE: "/tls/ca.pem",
  NATS_TLS_CERT_FILE: "/tls/cert.pem",
  NATS_TLS_KEY_FILE: "/tls/key.pem",
};
const TLS_FILES = {
  "/tls/ca.pem": "ca",
  "/tls/cert.pem": "cert",
  "/tls/key.pem": "key",
};

function ok(c: ReturnType<typeof readNatsConfig>): NatsConfig {
  if ("refused" in c) throw new Error(`refused: ${c.refused}`);
  return c;
}

describe("readNatsConfig", () => {
  it("development: nats:// and an NKey seed file", () => {
    const c = ok(
      readNatsConfig(
        "clinical",
        {
          ...DEV,
          NATS_URL: "nats://mhai-nats:4222",
          NATS_NKEY_SEED_FILE: "/s",
        },
        files({ "/s": `${SEED}\n` }),
      ),
    );
    expect(c.servers).toBe("nats://mhai-nats:4222");
    expect(c.auth.kind).toBe("nkey");
    if (c.auth.kind === "nkey")
      expect(new TextDecoder().decode(c.auth.seed)).toBe(SEED);
    expect(c.tls).toBeNull();
    expect(c.inboxPrefix).toBe("_INBOX_bff.clinical");
    expect(c.name).toBe("mhai-web-clinical");
  });

  it("the inbox prefix and name come from the app, never the environment", () => {
    const c = ok(
      readNatsConfig(
        "platform",
        {
          ...DEV,
          NATS_URL: "nats://n:4222",
          NATS_NKEY_SEED_FILE: "/s",
          NATS_INBOX_PREFIX: "_INBOX_bff.clinical",
          NATS_NAME: "x",
        },
        files({ "/s": SEED }),
      ),
    );
    expect(c.inboxPrefix).toBe("_INBOX_bff.platform");
    expect(c.name).toBe("mhai-web-platform");
  });

  it("A2: a file that isn't a user seed refuses, without its contents", () => {
    for (const content of [
      "SAAAAA-not-a-user-seed",
      `SA${"A".repeat(56)}`,
      "-----BEGIN PRIVATE KEY-----",
      "",
      `SU${"a".repeat(56)}`,
    ]) {
      const c = readNatsConfig(
        "clinical",
        { ...DEV, NATS_URL: "nats://n:4222", NATS_NKEY_SEED_FILE: "/s" },
        files({ "/s": content }),
      );
      expect(c).toEqual({ refused: "NATS_NKEY_SEED_FILE" });
    }
  });

  it("A2: an unreadable seed file refuses", () => {
    expect(
      readNatsConfig(
        "clinical",
        { ...DEV, NATS_URL: "nats://n:4222", NATS_NKEY_SEED_FILE: "/missing" },
        files({}),
      ),
    ).toEqual({ refused: "NATS_NKEY_SEED_FILE" });
  });

  it("no NATS_URL refuses; credentials in the URL refuse", () => {
    expect(
      readNatsConfig(
        "clinical",
        { ...DEV, NATS_NKEY_SEED_FILE: "/s" },
        files({ "/s": SEED }),
      ),
    ).toEqual({ refused: "NATS_URL" });
    expect(
      readNatsConfig(
        "clinical",
        { ...DEV, NATS_URL: "nats://u:p@n:4222", NATS_NKEY_SEED_FILE: "/s" },
        files({ "/s": SEED }),
      ),
    ).toEqual({ refused: "NATS_URL" });
    expect(
      readNatsConfig(
        "clinical",
        { ...DEV, NATS_URL: "http://n:4222", NATS_NKEY_SEED_FILE: "/s" },
        files({ "/s": SEED }),
      ),
    ).toEqual({ refused: "NATS_URL" });
  });

  it("development accepts a user and a password file", () => {
    const c = ok(
      readNatsConfig(
        "clinical",
        {
          ...DEV,
          NATS_URL: "nats://n:4222",
          NATS_USER: "bff_clinical",
          NATS_PASSWORD_FILE: "/p",
        },
        files({ "/p": "kpass\n" }),
      ),
    );
    expect(c.auth).toEqual({
      kind: "password",
      user: "bff_clinical",
      pass: "kpass",
    });
  });

  it("seed and password both set, or neither, refuses", () => {
    expect(
      readNatsConfig(
        "clinical",
        {
          ...DEV,
          NATS_URL: "nats://n:4222",
          NATS_NKEY_SEED_FILE: "/s",
          NATS_USER: "u",
          NATS_PASSWORD_FILE: "/p",
        },
        files({ "/s": SEED, "/p": "x" }),
      ),
    ).toHaveProperty("refused");
    expect(
      readNatsConfig(
        "clinical",
        { ...DEV, NATS_URL: "nats://n:4222" },
        files({}),
      ),
    ).toHaveProperty("refused");
  });

  describe("A10: outside development", () => {
    it("a nats:// URL refuses", () => {
      expect(
        readNatsConfig(
          "clinical",
          { NATS_URL: "nats://n:4222", NATS_NKEY_SEED_FILE: "/s", ...TLS },
          files({ "/s": SEED, ...TLS_FILES }),
        ),
      ).toEqual({ refused: "NATS_URL" });
    });
    it("a missing TLS file refuses", () => {
      for (const missing of Object.keys(TLS) as (keyof typeof TLS)[]) {
        const env: Record<string, string> = {
          NATS_URL: "tls://n:4222",
          NATS_NKEY_SEED_FILE: "/s",
          ...TLS,
        };
        delete env[missing];
        expect(
          readNatsConfig("clinical", env, files({ "/s": SEED, ...TLS_FILES })),
        ).toEqual({ refused: missing });
      }
      const unreadable = { ...TLS_FILES } as Record<string, string>;
      delete unreadable["/tls/key.pem"];
      expect(
        readNatsConfig(
          "clinical",
          { NATS_URL: "tls://n:4222", NATS_NKEY_SEED_FILE: "/s", ...TLS },
          files({ "/s": SEED, ...unreadable }),
        ),
      ).toEqual({ refused: "NATS_TLS_KEY_FILE" });
    });
    it("password auth refuses", () => {
      expect(
        readNatsConfig(
          "clinical",
          {
            NATS_URL: "tls://n:4222",
            NATS_USER: "u",
            NATS_PASSWORD_FILE: "/p",
            ...TLS,
          },
          files({ "/p": "x", ...TLS_FILES }),
        ),
      ).toEqual({ refused: "NATS_USER" });
    });
    it("tls:// with an NKey and the three files is accepted", () => {
      const c = ok(
        readNatsConfig(
          "clinical",
          { NATS_URL: "tls://n:4222", NATS_NKEY_SEED_FILE: "/s", ...TLS },
          files({ "/s": SEED, ...TLS_FILES }),
        ),
      );
      expect(c.tls).toEqual({
        ca: "/tls/ca.pem",
        cert: "/tls/cert.pem",
        key: "/tls/key.pem",
      });
    });
  });

  it("a refusal never holds a file's contents", () => {
    const c = readNatsConfig(
      "clinical",
      { ...DEV, NATS_URL: "nats://n:4222", NATS_NKEY_SEED_FILE: "/s" },
      files({ "/s": "SUPER-SECRET-VALUE" }),
    );
    expect(JSON.stringify(c)).not.toContain("SECRET");
  });
});
