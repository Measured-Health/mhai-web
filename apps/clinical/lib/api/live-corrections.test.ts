import { describe, expect, it, vi } from "vitest";
import { onUnauthorized } from "../auth/events";
import { createLiveClient } from "./live";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : Response.json(body, { status }),
  );
const call = (f: ReturnType<typeof reply>, i = 0) =>
  f.mock.calls[i] as unknown as [string, RequestInit];

describe("live corrections client", () => {
  it("reads the lists and the stats from the assumed endpoints", async () => {
    const fetchImpl = reply(200, []);
    const c = createLiveClient({ fetchImpl });
    await c.listPendingCorrections();
    await c.listMyCorrections();
    await c.listMyReviews();
    expect(fetchImpl.mock.calls.map((_, i) => call(fetchImpl, i)[0])).toEqual([
      "/api/v1/corrections?status=pending",
      "/api/v1/corrections/mine",
      "/api/v1/corrections/reviewed",
    ]);
    const stats = reply(200, { agreed: 1 });
    expect(
      await createLiveClient({ fetchImpl: stats }).getMyFeedbackStats(),
    ).toEqual({ agreed: 1 });
    expect(call(stats)[0]).toBe("/api/v1/feedback/stats/mine");
  });

  it("posts decisions with an idempotency key, encoding the id", async () => {
    const fetchImpl = reply(204);
    const c = createLiveClient({ fetchImpl });
    await c.approveCorrection("a/b", { idempotencyKey: "k-1" });
    await c.rejectCorrection(
      "c1",
      { reason_code: "unsafe", note: "Too fast" },
      { idempotencyKey: "k-2" },
    );
    await c.withdrawCorrection("c2", { idempotencyKey: "k-3" });
    const [u1, i1] = call(fetchImpl, 0);
    expect(u1).toBe("/api/v1/corrections/a%2Fb/approve");
    expect(i1).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { "Idempotency-Key": "k-1" },
    });
    expect(i1.body).toBeUndefined();
    const [u2, i2] = call(fetchImpl, 1);
    expect(u2).toBe("/api/v1/corrections/c1/reject");
    expect(JSON.parse(String(i2.body))).toEqual({
      reason_code: "unsafe",
      note: "Too fast",
    });
    expect(call(fetchImpl, 2)[0]).toBe("/api/v1/corrections/c2/withdraw");
    for (const i of [0, 1, 2])
      expect(String(call(fetchImpl, i)[1].body ?? "")).not.toMatch(
        /user_id|clinician_id|submitted_by/,
      );
  });

  it("sends keepalive only when asked (a decision made while leaving)", async () => {
    const fetchImpl = reply(204);
    const c = createLiveClient({ fetchImpl });
    await c.approveCorrection("c1", { idempotencyKey: "k", keepalive: true });
    expect(call(fetchImpl, 0)[1].keepalive).toBe(true);
    await c.approveCorrection("c1");
    expect(call(fetchImpl, 1)[1].keepalive).toBeUndefined();
  });

  it("passes the API's refusal codes through", async () => {
    const own = createLiveClient({
      fetchImpl: reply(403, { code: "self_approval" }),
    });
    await expect(own.approveCorrection("c1")).rejects.toMatchObject({
      status: 403,
      code: "self_approval",
    });
    const gone = createLiveClient({
      fetchImpl: reply(409, { code: "already_decided" }),
    });
    await expect(
      gone.rejectCorrection("c1", { reason_code: "unsafe" }),
    ).rejects.toMatchObject({ status: 409, code: "already_decided" });
  });

  it("reports an expired session once from a decision", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    const c = createLiveClient({
      fetchImpl: reply(401, { code: "session_expired" }),
    });
    await expect(c.withdrawCorrection("c1")).rejects.toMatchObject({
      status: 401,
    });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });
});
