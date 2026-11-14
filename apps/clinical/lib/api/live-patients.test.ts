import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { ApiError } from "./errors";
import { createLivePatients } from "./live-patients";
import { samplePatients } from "./mock-patients";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLivePatients({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
const body = (n = 0) => JSON.parse(call(n)[1].body as string);
const [A, B] = samplePatients();
const MATCH = {
  id: "10000000-0000-4000-8000-000000000001",
  reason: "mrn_only",
  a: A,
  b: B,
  proposed_at: "2026-11-12T08:00:00Z",
};
const KEY = { idempotencyKey: "k-1" };
beforeEach(() => fetchImpl.mockReset());

describe("live patients client", () => {
  it("reads the matches strictly through the proxy", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json({ matches: [MATCH] }),
    );
    expect(await client().listMatches()).toEqual({ matches: [MATCH] });
    expect(call()[0]).toBe("/api/v1/hospital/patient-matches");
    expect(call()[1]).toMatchObject({ method: "GET", cache: "no-store" });
  });

  it.each([
    ["an extra key", { matches: [{ ...MATCH, dob: "1960-01-01" }] }],
    ["an extra card key", { matches: [{ ...MATCH, a: { ...A, dob: "x" } }] }],
    ["an unknown reason", { matches: [{ ...MATCH, reason: "name_only" }] }],
    ["a bad id", { matches: [{ ...MATCH, id: "m-1" }] }],
    ["no list", {}],
  ])("fails closed on %s (502)", async (_, reply) => {
    fetchImpl.mockImplementation(async () => Response.json(reply));
    await expect(client().listMatches()).rejects.toEqual(
      new ApiError(502, "bad_gateway"),
    );
  });

  it("confirms with the kept side and the code in the body, and a key", async () => {
    fetchImpl.mockImplementation(
      async () => new Response(null, { status: 204 }),
    );
    await client().confirmMatch("m 1", "b", { mfaCode: "123456" }, KEY);
    expect(call()[0]).toBe("/api/v1/hospital/patient-matches/m%201/confirm");
    expect(call()[1]).toMatchObject({ method: "POST" });
    expect(call()[1].headers).toMatchObject({ "Idempotency-Key": "k-1" });
    expect(body()).toEqual({ keep: "b", mfa_code: "123456" });
  });

  it("rejects with a backup code", async () => {
    fetchImpl.mockImplementation(
      async () => new Response(null, { status: 204 }),
    );
    await client().rejectMatch("m-1", { backupCode: "aaaa-bbbb" }, KEY);
    expect(call()[0]).toBe("/api/v1/hospital/patient-matches/m-1/reject");
    expect(body()).toEqual({ backup_code: "aaaa-bbbb" });
  });

  it("excludes by MRN and reads the 202 strictly", async () => {
    const reply = {
      patient_id: A!.id,
      purge_by: "2026-11-14T09:00:00Z",
      purge_held: true,
    };
    fetchImpl.mockImplementation(async () =>
      Response.json(reply, { status: 202 }),
    );
    expect(
      await client().excludePatient(
        { mrn: "SYN-1", reason: "objection" },
        { mfaCode: "123456" },
        KEY,
      ),
    ).toEqual(reply);
    expect(call()[0]).toBe("/api/v1/hospital/patient-exclusions");
    expect(body()).toEqual({
      mrn: "SYN-1",
      reason: "objection",
      mfa_code: "123456",
    });
  });

  it("reads a reply without purge_held (core before 1.21.0) as not held", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json(
        { patient_id: A!.id, purge_by: "2026-11-14T09:00:00Z" },
        { status: 202 },
      ),
    );
    const r = await client().excludePatient(
      { patient_id: A!.id, reason: "other" },
      { mfaCode: "123456" },
      KEY,
    );
    expect(r.purge_held).toBe(false);
  });

  it("fails closed on an exclusion reply with anything else in it", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json(
        { patient_id: A!.id, purge_by: "soon", purge_held: false },
        { status: 202 },
      ),
    );
    await expect(
      client().excludePatient(
        { mrn: "SYN-1", reason: "other" },
        { mfaCode: "123456" },
        KEY,
      ),
    ).rejects.toEqual(new ApiError(502, "bad_gateway"));
  });

  it("keeps only the code of a refusal", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json(
        { code: "conflict", detail: "SYN-1 names two" },
        {
          status: 409,
        },
      ),
    );
    const e = await client()
      .excludePatient({ mrn: "SYN-1", reason: "other" }, { mfaCode: "1" }, KEY)
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe("conflict");
    expect(JSON.stringify(e)).not.toContain("SYN-1");
  });
});
