import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { ApiError, NotEligibleError } from "@mhai/api-client/errors";
import { createLiveClearances } from "./live-clearances";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveClearances({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
const reply = (make: () => Response) =>
  fetchImpl.mockImplementation(async () => make());
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

describe("live clearance client", () => {
  it("uses the paths and methods of spec §10", async () => {
    reply(() => Response.json({}));
    const c = client();
    const key = { idempotencyKey: "k" };
    await c.getNamedAccess();
    await c.listClearances();
    await c.getClearance("cl 1");
    await c.revokeClearance(
      "cl_1",
      { reason: "other", note: "Typo", mfaCode: "123456" },
      key,
    );
    await c.narrowClearance(
      "cl_1",
      {
        remove: ["s-1"],
        reason: "person_left",
        version: 3,
        backupCode: "abcd-efgh",
      },
      key,
    );
    expect(fetchImpl.mock.calls.map((x) => [x[1]!.method, x[0]])).toEqual([
      ["GET", "/api/v1/analysis/named-access"],
      ["GET", "/api/v1/hospital/clearances"],
      ["GET", "/api/v1/hospital/clearances/cl%201"],
      ["POST", "/api/v1/hospital/clearances/cl_1/revoke"],
      ["POST", "/api/v1/hospital/clearances/cl_1/narrow"],
    ]);
    expect(JSON.parse(call(3)[1].body as string)).toEqual({
      reason: "other",
      note: "Typo",
      mfa_code: "123456",
    });
    expect(JSON.parse(call(4)[1].body as string)).toEqual({
      remove: ["s-1"],
      reason: "person_left",
      version: 3,
      backup_code: "abcd-efgh",
    });
    expect(call(3)[1].headers).toMatchObject({ "Idempotency-Key": "k" });
  });

  it("sends the upload as multipart with the exact field names and an Idempotency-Key", async () => {
    reply(() => Response.json({ id: "cl_new" }));
    const file = new File(["%PDF-1.7"], "letter.pdf", {
      type: "application/pdf",
    });
    await client().uploadClearance(
      {
        file,
        signed_by: "Dr. Funmi Ade",
        signer_title: "Chief Medical Director",
        letter_date: "2026-10-01",
        covered: ["s-nwosu", "s-obi"],
        covered_platform: ["tunde.okafor@measured-health.example"],
        end_date: "2027-03-12",
        renews: "cl_old",
        mfaCode: "123456",
      },
      { idempotencyKey: "up-1" },
    );
    const [path, init] = call();
    expect(path).toBe("/api/v1/hospital/clearances");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("up-1");
    expect(headers["Content-Type"]).toBeUndefined();
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual([
      "file",
      "signed_by",
      "signer_title",
      "letter_date",
      "covered",
      "covered",
      "covered_platform",
      "end_date",
      "renews",
      "mfa_code",
    ]);
    expect(form.getAll("covered")).toEqual(["s-nwosu", "s-obi"]);
    expect(form.get("covered_platform")).toBe(
      "tunde.okafor@measured-health.example",
    );
    expect(form.get("mfa_code")).toBe("123456");
    expect(form.get("end_date")).toBe("2027-03-12");
  });

  it("reads a 404 named-access as Off", async () => {
    reply(() => Response.json({ code: "not_found" }, { status: 404 }));
    await expect(client().getNamedAccess()).resolves.toEqual({
      position: "off",
      since: null,
    });
  });

  it("returns the position the API sent", async () => {
    reply(() =>
      Response.json({
        position: "letters_only",
        since: "2026-10-01T00:00:00Z",
      }),
    );
    await expect(client().getNamedAccess()).resolves.toEqual({
      position: "letters_only",
      since: "2026-10-01T00:00:00Z",
    });
  });

  it("keeps the ids and emails of a not_eligible refusal", async () => {
    reply(() =>
      Response.json(
        { code: "not_eligible", ids: ["s-reyes"] },
        { status: 422 },
      ),
    );
    const file = new File(["%PDF"], "l.pdf");
    const err = await client()
      .uploadClearance(
        {
          file,
          signed_by: "A",
          signer_title: "B",
          letter_date: "2026-10-01",
          covered: ["s-reyes"],
          end_date: "2027-01-01",
          mfaCode: "123456",
        },
        { idempotencyKey: "k" },
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotEligibleError);
    expect((err as NotEligibleError).ids).toEqual(["s-reyes"]);
  });

  it("fetches a page as an image Blob, and refuses other types", async () => {
    reply(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/png" },
        }),
    );
    const b = await client().getClearancePage("cl_1", 2);
    expect(b.type).toBe("image/png");
    expect(call()[0]).toBe("/api/v1/hospital/clearances/cl_1/pages/2");
    expect((call()[1].headers as Record<string, string>).Accept).toBe(
      "image/png, image/jpeg",
    );
    reply(
      () =>
        new Response("<svg/>", {
          headers: { "Content-Type": "image/svg+xml" },
        }),
    );
    await expect(client().getClearancePage("cl_1", 1)).rejects.toMatchObject({
      status: 502,
      code: "bad_gateway",
    });
    reply(() => Response.json({ code: "not_ready" }, { status: 409 }));
    await expect(client().getClearancePage("cl_1", 1)).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
