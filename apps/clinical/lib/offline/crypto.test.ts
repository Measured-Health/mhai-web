import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, deviceKey, encrypt } from "./crypto";

beforeEach(async () => {
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase("mhai-outbox");
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});

describe("deviceKey", () => {
  it("creates one key even when two tabs ask at once", async () => {
    const [a, b] = await Promise.all([deviceKey(), deviceKey()]);
    const sealed = await encrypt({ ok: 1 }, a);
    await expect(decrypt(sealed, b)).resolves.toEqual({ ok: 1 });
    // The stored key is the one both got.
    await expect(decrypt(sealed, await deviceKey())).resolves.toEqual({
      ok: 1,
    });
  });

  it("keeps the same key across calls", async () => {
    const sealed = await encrypt("x", await deviceKey());
    await expect(decrypt(sealed, await deviceKey())).resolves.toBe("x");
  });
});
