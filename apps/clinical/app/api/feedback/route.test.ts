import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appendFeedback = vi.fn(async () => {});
vi.mock("@/lib/server/feedback", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/feedback")>()),
  appendFeedback: (...a: unknown[]) => appendFeedback(...(a as [])),
}));

const body = {
  message: "The banner is easy to miss on mobile.",
  contact: "",
  page: "/",
  viewport: "390×844",
  website: "",
};
const post = (b: unknown, ip = "1.2.3.4", origin = "http://demo") =>
  new Request("http://demo/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Real-IP": ip,
      host: "demo",
      origin,
    },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

// A fresh module per test, so the in-memory rate limits start empty.
const load = async () => (await import("./route")).POST;

beforeEach(() => {
  vi.resetModules();
  appendFeedback.mockReset();
  appendFeedback.mockResolvedValue(undefined);
  vi.stubEnv("FEEDBACK_LOG_PATH", "/tmp/fb.jsonl");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/feedback", () => {
  it("saves to the feedback file and says ok", async () => {
    const res = await (await load())(post(body));
    expect(res.status).toBe(200);
    expect(appendFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ message: body.message }),
      "/tmp/fb.jsonl",
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("refuses a mismatched Origin, and saves nothing", async () => {
    const res = await (
      await load()
    )(post(body, "1.2.3.4", "https://evil.test"));
    expect(res.status).toBe(403);
    expect(appendFeedback).not.toHaveBeenCalled();
  });
  it("is unavailable when the file can't be written", async () => {
    appendFeedback.mockRejectedValue(new Error("EACCES"));
    const res = await (await load())(post(body));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
  it("rejects bad input and bad JSON", async () => {
    const POST = await load();
    expect((await POST(post({ ...body, message: "short" }))).status).toBe(400);
    expect((await POST(post("{nope"))).status).toBe(400);
    expect(appendFeedback).not.toHaveBeenCalled();
  });
  it("pretends to accept a filled spam trap, and saves nothing", async () => {
    const res = await (await load())(post({ ...body, website: "x" }));
    expect(res.status).toBe(200);
    expect(appendFeedback).not.toHaveBeenCalled();
  });
  it("limits each person to 5 sends per 10 minutes", async () => {
    const POST = await load();
    for (let i = 0; i < 5; i++)
      expect((await POST(post(body))).status).toBe(200);
    expect((await POST(post(body))).status).toBe(429);
    expect((await POST(post(body, "5.6.7.8"))).status).toBe(200);
  });
});
