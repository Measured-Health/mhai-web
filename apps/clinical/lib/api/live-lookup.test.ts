import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { ApiError } from "./errors";
import { createLiveLookup } from "./live-lookup";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveLookup({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
const FOUND = {
  id: "6f1c2a01-5e1d-4c3b-9a7e-000000000001",
  full_name: "Maryam Abdullahi",
  mrn: "SYN-204817",
  age: 67,
  sex: "female",
};
beforeEach(() => fetchImpl.mockReset());

describe("live patient lookup", () => {
  it("posts the trimmed MRN in the body, never the address, and reads the patient", async () => {
    fetchImpl.mockImplementation(async () => Response.json(FOUND));
    expect(await client().lookupPatient("  syn-204817 ")).toEqual(FOUND);
    const [url, init] = call();
    expect(url).toBe("/api/v1/patients/lookup");
    expect(url).not.toMatch(/204817/);
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(JSON.parse(init.body as string)).toEqual({ mrn: "syn-204817" });
  });

  it.each([
    ["an extra key", { ...FOUND, dob: "1959-01-01" }],
    ["another MRN", { ...FOUND, mrn: "SYN-1" }],
    ["nothing", null],
  ])("fails closed on %s (502)", async (_, reply) => {
    fetchImpl.mockImplementation(async () => Response.json(reply));
    await expect(client().lookupPatient("SYN-204817")).rejects.toEqual(
      new ApiError(502, "bad_gateway"),
    );
  });

  it.each([
    [404, "not_found"],
    [409, "conflict"],
    [429, "rate_limited"],
    [503, "not_ready"],
  ])("keeps a %i to its code, and doesn't retry", async (status, code) => {
    fetchImpl.mockImplementation(async () =>
      Response.json({ code, detail: "patient SYN-204817 ..." }, { status }),
    );
    const e = (await client()
      .lookupPatient("SYN-204817")
      .catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code]).toEqual([status, code]);
    expect(JSON.stringify(e)).not.toMatch(/204817/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
