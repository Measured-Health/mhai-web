import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { ApiError } from "./errors";
import { createLiveEmr } from "./live-emr";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveEmr({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

describe("live alert settings client", () => {
  it("reads hospital/alert-settings through the proxy", async () => {
    const out = { version: 3 };
    fetchImpl.mockImplementation(async () => Response.json(out));
    expect(await client().getAlertSettings()).toEqual(out);
    expect(call()[0]).toBe("/api/v1/hospital/alert-settings");
    expect(call()[1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("saves one section with its version and an Idempotency-Key", async () => {
    fetchImpl.mockImplementation(async () => Response.json({ version: 4 }));
    await client().updateAlertSettings(
      { version: 3, recipients: { queue: true, clinician_ids: ["s-1"] } },
      { idempotencyKey: "k1" },
    );
    expect(call()[0]).toBe("/api/v1/hospital/alert-settings");
    expect(call()[1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(call()[1].body as string)).toEqual({
      version: 3,
      recipients: { queue: true, clinician_ids: ["s-1"] },
    });
    expect(call()[1].headers).toMatchObject({ "Idempotency-Key": "k1" });
  });

  it("keeps only the code of a refusal", async () => {
    fetchImpl.mockImplementationOnce(async () =>
      Response.json(
        { code: "no_recipients", detail: "upstream words" },
        { status: 422 },
      ),
    );
    const e = await client()
      .updateAlertSettings(
        { version: 1, recipients: { queue: false, clinician_ids: [] } },
        { idempotencyKey: "k" },
      )
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 422, code: "no_recipients" });
    expect(JSON.stringify(e)).not.toContain("upstream words");
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ code: "conflict" }, { status: 409 }),
    );
    await expect(
      client().updateAlertSettings(
        { version: 1, units: { covered: [] } },
        { idempotencyKey: "k" },
      ),
    ).rejects.toMatchObject({ status: 409, code: "conflict" });
  });
});
