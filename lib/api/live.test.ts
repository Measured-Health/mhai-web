import { describe, expect, it, vi } from "vitest";
import { onUnauthorized } from "../auth/events";
import { ApiError } from "./errors";
import { createLiveClient } from "./live";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : Response.json(body, { status }),
  );

describe("live clinical client", () => {
  it("creates a query through the same-origin proxy", async () => {
    const fetchImpl = reply(202, { query_id: "q1", status: "queued" });
    const c = createLiveClient({ fetchImpl });
    expect(await c.createQuery({} as never)).toEqual({ query_id: "q1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/v1/queries");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(String(init.body)).not.toMatch(/user_id|clinician_id/);
  });

  it("encodes ids", async () => {
    const fetchImpl = reply(200, {});
    await createLiveClient({ fetchImpl }).getResult("a/b");
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/v1/queries/a%2Fb/result",
    );
  });

  it("reports a 401 once per call and throws session_expired", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    const c = createLiveClient({
      fetchImpl: reply(401, { code: "session_expired" }),
    });
    await expect(c.getStatus("q1")).rejects.toMatchObject({
      status: 401,
      code: "session_expired",
    });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it("keeps the API's error code", async () => {
    const c = createLiveClient({
      fetchImpl: reply(409, { code: "result_not_ready" }),
    });
    const e = await c.getResult("q1").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: "result_not_ready" });
  });

  it("reads readiness, naming what's down", async () => {
    expect(
      await createLiveClient({
        fetchImpl: reply(200, { db: true }),
      }).getReadiness(),
    ).toEqual({
      ok: true,
      degraded_services: [],
    });
    const down = createLiveClient({
      fetchImpl: reply(503, { db: true, worker: false, ollama: false }),
    });
    expect(await down.getReadiness()).toEqual({
      ok: false,
      degraded_services: ["worker", "ollama"],
    });
  });

  it("turns a network failure into an ApiError", async () => {
    const c = createLiveClient({
      fetchImpl: vi.fn(async () => {
        throw new TypeError("offline");
      }),
    });
    await expect(c.getStatus("q1")).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
  });
});
