import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  MOCK_BACKUP_CODES,
  MOCK_CODE,
  createStepUp,
  requireStepUp,
} from "./step-up";

const EMAIL = "ada.bakare@measured-health.example";

describe("platform demo step-up", () => {
  it("accepts the demo code and each backup code once", async () => {
    const s = createStepUp(() => 0);
    expect(await s.check(EMAIL, { mfa_code: MOCK_CODE })).toBe("ok");
    expect(MOCK_BACKUP_CODES).toHaveLength(10);
    const code = MOCK_BACKUP_CODES[3]!;
    expect(await s.check(EMAIL, { backup_code: code.toLowerCase() })).toBe(
      "ok",
    );
    expect(await s.check(EMAIL, { backup_code: code })).toBe("invalid");
  });

  it("locks after five wrong codes for 15 minutes of the clock", async () => {
    let t = 1_000;
    const s = createStepUp(() => t);
    for (let i = 0; i < 4; i++)
      expect(await s.check(EMAIL, { mfa_code: "000000" })).toBe("invalid");
    expect(await s.check(EMAIL, { mfa_code: "000000" })).toBe("invalid");
    expect(await s.check(EMAIL, { mfa_code: MOCK_CODE })).toBe("locked");
    // Someone else is not locked.
    expect(
      await s.check("tunde.okafor@measured-health.example", {
        mfa_code: MOCK_CODE,
      }),
    ).toBe("ok");
    t += 15 * 60_000 - 1;
    expect(await s.check(EMAIL, { mfa_code: MOCK_CODE })).toBe("locked");
    t += 1;
    expect(await s.check(EMAIL, { mfa_code: MOCK_CODE })).toBe("ok");
  });

  it("requireStepUp maps to the API's codes", async () => {
    const s = createStepUp(() => 0);
    const err = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: ApiError) => [e.status, e.code],
      );
    expect(
      await err(
        requireStepUp(s, {
          email: EMAIL,
          twoStep: false,
          body: { mfa_code: MOCK_CODE },
        }),
      ),
    ).toEqual([403, "mfa_required"]);
    expect(
      await err(
        requireStepUp(s, {
          email: EMAIL,
          twoStep: true,
          body: { mfa_code: "1" },
        }),
      ),
    ).toEqual([403, "mfa_invalid"]);
    expect(
      await err(requireStepUp(s, { email: EMAIL, twoStep: true, body: {} })),
    ).toEqual([422, "invalid"]);
    await expect(
      requireStepUp(s, {
        email: EMAIL,
        twoStep: true,
        body: { mfa_code: MOCK_CODE },
      }),
    ).resolves.toBeUndefined();
    for (let i = 0; i < 5; i++)
      await requireStepUp(s, {
        email: EMAIL,
        twoStep: true,
        body: { mfa_code: "999999" },
      }).catch(() => {});
    expect(
      await err(
        requireStepUp(s, {
          email: EMAIL,
          twoStep: true,
          body: { mfa_code: MOCK_CODE },
        }),
      ),
    ).toEqual([429, "mfa_locked"]);
  });
});
