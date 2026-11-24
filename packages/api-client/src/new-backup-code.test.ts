import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearNewBackupCode,
  offerNewBackupCode,
  onNewBackupCode,
  pendingBackupCode,
  whenBackupCodeSaved,
} from "./new-backup-code";

afterEach(() => clearNewBackupCode());

describe("the new backup code store", () => {
  it("holds one code; a newer one replaces it", () => {
    const seen = vi.fn();
    const off = onNewBackupCode(seen);
    offerNewBackupCode("ppppp-qqqqq");
    offerNewBackupCode("rrrrr-sssss");
    expect(pendingBackupCode()).toBe("rrrrr-sssss");
    expect(seen).toHaveBeenLastCalledWith("rrrrr-sssss");
    off();
  });

  it("an action waits until the code is cleared", async () => {
    offerNewBackupCode("ppppp-qqqqq");
    let done = false;
    const wait = whenBackupCodeSaved().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    clearNewBackupCode();
    await wait;
    expect(done).toBe(true);
    expect(pendingBackupCode()).toBeNull();
  });

  it("with no code, nothing waits", async () => {
    await expect(whenBackupCodeSaved()).resolves.toBeUndefined();
  });

  it("is never stored in the browser", () => {
    offerNewBackupCode("ppppp-qqqqq");
    expect(JSON.stringify({ ...localStorage })).not.toContain("ppppp-qqqqq");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("ppppp-qqqqq");
  });
});
