import { describe, expect, it, vi } from "vitest";
import { ApiError, NotEligibleError } from "./errors";
import { createApiRequest } from "./request";

describe("createApiRequest", () => {
  it("prefix is applied", async () => {
    const { apiOk } = createApiRequest({
      prefix: "/api/platform",
      onUnauthorized: vi.fn(),
    });
    const fetchImpl = vi.fn(async () => Response.json({ ok: 1 }));
    expect(await apiOk(fetchImpl, "/hospitals")).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/platform/hospitals",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });
  it("401 calls onUnauthorized once and throws session_expired", async () => {
    const onUnauthorized = vi.fn();
    const { apiRequest } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized,
    });
    const fetchImpl = vi.fn(async () =>
      Response.json({ code: "unauthorized" }, { status: 401 }),
    );
    const e = await apiRequest(fetchImpl, "/me").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 401, code: "session_expired" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
  it("network failure is ApiError 0 network", async () => {
    const onUnauthorized = vi.fn();
    const { apiOk } = createApiRequest({ prefix: "/api/v1", onUnauthorized });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const e = await apiOk(fetchImpl, "/me").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 0, code: "network" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a form is sent without a JSON content type", async () => {
    const { apiOk } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized: vi.fn(),
    });
    const fetchImpl = vi.fn(async () => Response.json({ id: "cl_1" }));
    const form = new FormData();
    form.set("end_date", "2027-03-12");
    await apiOk(fetchImpl, "/hospital/clearances", {
      method: "POST",
      form,
      headers: { "Idempotency-Key": "k1" },
    });
    const init = (
      fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(init.body).toBe(form);
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Content-Type");
    expect(headers).toMatchObject({
      Accept: "application/json",
      "Idempotency-Key": "k1",
    });
  });

  it("body and form together throw", async () => {
    const { apiRequest } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized: vi.fn(),
    });
    const fetchImpl = vi.fn(async () => Response.json({}));
    await expect(
      apiRequest(fetchImpl, "/x", {
        method: "POST",
        body: { a: 1 },
        form: new FormData(),
      }),
    ).rejects.toThrow(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("apiBlob returns the blob, and a 403 throws an ApiError with its code", async () => {
    const onUnauthorized = vi.fn();
    const { apiBlob } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized,
    });
    const page = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(page, { headers: { "Content-Type": "image/png" } }),
    );
    const accept = ["image/png", "image/jpeg", "image/svg+xml"] as const;
    const blob = await apiBlob(
      fetchImpl,
      "/hospital/clearances/c1/pages/1",
      accept,
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(page);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/hospital/clearances/c1/pages/1",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "image/png, image/jpeg, image/svg+xml" },
      }),
    );

    const refused = vi.fn(async () =>
      Response.json({ code: "clearance_ended" }, { status: 403 }),
    );
    const e = await apiBlob(refused, "/p", accept).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 403, code: "clearance_ended" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("apiBlob: no network, a 401 and a type it didn't ask for", async () => {
    const onUnauthorized = vi.fn();
    const { apiBlob } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized,
    });
    const accept = ["image/png"];
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await apiBlob(offline, "/p", accept).catch((x) => x)).toMatchObject({
      status: 0,
      code: "network",
    });
    const signedOut = vi.fn(async () => new Response(null, { status: 401 }));
    expect(
      await apiBlob(signedOut, "/p", accept).catch((x) => x),
    ).toMatchObject({ status: 401, code: "session_expired" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    const html = vi.fn(
      async () =>
        new Response("<p>hi</p>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    );
    expect(await apiBlob(html, "/p", accept).catch((x) => x)).toMatchObject({
      status: 502,
      code: "bad_gateway",
    });
    const csv = vi.fn(
      async () =>
        new Response("a,b", {
          headers: { "Content-Type": "text/csv; charset=utf-8" },
        }),
    );
    expect((await apiBlob(csv, "/p", ["text/csv"])).type).toMatch(/^text\/csv/);
    expect((await apiBlob(csv, "/p", ["Text/CSV"])).type).toMatch(/^text\/csv/);
  });

  it("apiBlob: a body cut off mid-download is ApiError 200 interrupted", async () => {
    const { apiBlob } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized: vi.fn(),
    });
    const dropped = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("a,b"));
              c.error(new TypeError("network error"));
            },
          }),
          { headers: { "Content-Type": "text/csv" } },
        ),
    );
    const e = await apiBlob(dropped, "/p", ["text/csv"]).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 200, code: "interrupted" });
  });

  it("a not_eligible refusal keeps its checked ids, and not_eligible_platform its emails", async () => {
    const { apiOk } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized: vi.fn(),
    });
    const ids = vi.fn(async () =>
      Response.json(
        { code: "not_eligible", ids: ["s-obi", "bad id!", 7, "s_2"] },
        { status: 422 },
      ),
    );
    const e1 = await apiOk(ids, "/hospital/clearances").catch((x) => x);
    expect(e1).toBeInstanceOf(NotEligibleError);
    expect(e1).toBeInstanceOf(ApiError);
    expect(e1).toMatchObject({
      status: 422,
      code: "not_eligible",
      ids: ["s-obi", "s_2"],
      emails: [],
    });

    const emails = vi.fn(async () =>
      Response.json(
        {
          code: "not_eligible_platform",
          emails: [
            "ada@measured-health.example",
            "not an email",
            null,
            "ev\u202Eil@measured-health.example",
            "zero\u200Bwidth@measured-health.example",
          ],
          ids: ["s-obi"],
        },
        { status: 422 },
      ),
    );
    const e2 = await apiOk(emails, "/hospital/clearances").catch((x) => x);
    expect(e2).toBeInstanceOf(NotEligibleError);
    expect(e2).toMatchObject({
      code: "not_eligible_platform",
      ids: [],
      emails: ["ada@measured-health.example"],
    });

    const both = vi.fn(async () =>
      Response.json(
        { code: "not_eligible", ids: ["s-obi"], emails: ["a@b.example"] },
        { status: 422 },
      ),
    );
    expect(await apiOk(both, "/x").catch((x) => x)).toMatchObject({
      ids: ["s-obi"],
      emails: [],
    });

    const many = vi.fn(async () =>
      Response.json(
        {
          code: "not_eligible",
          ids: Array.from({ length: 30 }, (_, i) => `s${i}`),
        },
        { status: 422 },
      ),
    );
    const e3 = (await apiOk(many, "/x").catch((x) => x)) as NotEligibleError;
    expect(e3.ids).toHaveLength(20);

    const other = vi.fn(async () =>
      Response.json({ code: "invalid", ids: ["s1"] }, { status: 422 }),
    );
    const e4 = await apiOk(other, "/x").catch((x) => x);
    expect(e4).toBeInstanceOf(ApiError);
    expect(e4).not.toBeInstanceOf(NotEligibleError);
  });
});
