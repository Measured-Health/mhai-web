import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import type { AnalyticsOut } from "./analytics-contract";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";

const START = Date.parse("2026-10-22T09:30:00.000Z");
let n = 0;
const KEY = () => ({ idempotencyKey: `kn-${++n}` });

function setup(
  over: {
    analytics?: "normal" | "guard" | "unavailable";
    notifications?: "normal" | "unavailable";
  } = {},
  email: string | null = TEAM_EMAILS.ada,
) {
  let me = email;
  const m = createMockPlatform({
    now: () => START,
    me: () => me,
    delayMs: 0,
    ...over,
  });
  return { m, as: (e: string | null) => void (me = e) };
}

async function failure(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code];
    throw e;
  }
  throw new Error("expected a refusal");
}

const changesOf = (a: AnalyticsOut) => {
  if ("unavailable" in a.changes) throw new Error("changes unavailable");
  return a.changes.items;
};

describe("mock notifications", () => {
  it("one per analytics change, newest first, Northgate's serious change newest", async () => {
    const { m } = setup();
    const { items, unseen } = await m.listNotifications();
    const changes = changesOf(await m.getAnalytics("30d"));
    expect(items).toHaveLength(changes.length);
    expect(unseen).toBe(changes.length);
    expect(items[0]).toMatchObject({
      change_id: "chg_ngh_critical_ack",
      serious: true,
      direction: "worse",
      hospital: { id: "h_northgate", name: "Northgate General Hospital" },
      seen: false,
    });
    const times = items.map((i) => Date.parse(i.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(times.every((t) => t <= START)).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) {
      const c = changes.find((x) => x.id === i.change_id)!;
      expect(c).toBeDefined();
      expect(i).toMatchObject({
        summary: c.summary,
        serious: c.serious,
        direction: c.direction,
        hospital: c.hospital,
      });
      expect(i.id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(items.length).toBeLessThanOrEqual(20);
    // Ids are stable: a second read gives the same list.
    expect((await m.listNotifications()).items.map((i) => i.id)).toEqual(
      items.map((i) => i.id),
    );
  });

  it("follows the current changes ('guard' has no serious one)", async () => {
    const { m } = setup({ analytics: "guard" });
    const { items } = await m.listNotifications();
    expect(items.some((i) => i.serious)).toBe(false);
    expect(items.map((i) => i.change_id)).not.toContain("chg_ngh_critical_ack");
  });

  it("seen is per person (Ada marks seen, Tunde still sees new)", async () => {
    const { m, as } = setup();
    const before = await m.listNotifications();
    const first = before.items[0]!;
    const out = await m.markSeen({ ids: [first.id] }, KEY());
    expect(out).toEqual({ unseen: before.unseen - 1 });
    const ada = await m.listNotifications();
    expect(ada.unseen).toBe(before.unseen - 1);
    expect(ada.items.find((i) => i.id === first.id)!.seen).toBe(true);

    as(TEAM_EMAILS.tunde);
    const tunde = await m.listNotifications();
    expect(tunde.unseen).toBe(before.unseen);
    expect(tunde.items.every((i) => !i.seen)).toBe(true);

    // An auditor keeps their own read state too.
    as(TEAM_EMAILS.amara);
    expect((await m.markSeen({ ids: [first.id] }, KEY())).unseen).toBe(
      before.unseen - 1,
    );
    as(TEAM_EMAILS.tunde);
    expect((await m.listNotifications()).unseen).toBe(before.unseen);
  });

  it("mark all seen sets unseen to 0", async () => {
    const { m, as } = setup();
    expect((await m.listNotifications()).unseen).toBeGreaterThan(0);
    expect(await m.markSeen({}, KEY())).toEqual({ unseen: 0 });
    const after = await m.listNotifications();
    expect(after.unseen).toBe(0);
    expect(after.items.every((i) => i.seen)).toBe(true);
    // Unknown ids are ignored; marking again changes nothing.
    expect(await m.markSeen({ ids: ["ntf_nope"] }, KEY())).toEqual({
      unseen: 0,
    });
    as(TEAM_EMAILS.tunde);
    expect((await m.listNotifications()).unseen).toBe(after.items.length);
  });

  it("marking seen is not logged as admin activity", async () => {
    const { m } = setup();
    const before = (await m.listActivity({})).events.length;
    await m.markSeen({}, KEY());
    expect((await m.listActivity({})).events.length).toBe(before);
  });

  it("refuses bad ids with 422 and needs someone signed in", async () => {
    const { m, as } = setup();
    expect(
      await failure(m.markSeen({ ids: "all" as unknown as string[] }, KEY())),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(m.markSeen({ ids: [1 as unknown as string] }, KEY())),
    ).toEqual([422, "invalid"]);
    as(null);
    expect(await failure(m.listNotifications())).toEqual([
      401,
      "session_expired",
    ]);
    expect(await failure(m.markSeen({}, KEY()))).toEqual([
      401,
      "session_expired",
    ]);
  });

  it("the 'unavailable' option fails the list with 503", async () => {
    const { m } = setup({ notifications: "unavailable" });
    expect(await failure(m.listNotifications())).toEqual([503, "unavailable"]);
    expect(await failure(m.markSeen({}, KEY()))).toEqual([503, "unavailable"]);
    // The rest of the demo still works.
    expect((await m.getEmailPref()).mode).toBe("off");
  });
});

describe("mock analytics email preference", () => {
  it("the preference defaults to off, saves, and a stale version is 409", async () => {
    const { m, as } = setup();
    expect(await m.getEmailPref()).toEqual({ mode: "off", version: 1 });
    const saved = await m.setEmailPref({ mode: "critical", version: 1 }, KEY());
    expect(saved).toEqual({ mode: "critical", version: 2 });
    expect(await m.getEmailPref()).toEqual({ mode: "critical", version: 2 });
    expect(
      await failure(
        m.setEmailPref({ mode: "critical_and_digest", version: 1 }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    expect(await m.getEmailPref()).toEqual({ mode: "critical", version: 2 });

    // The same key gets the same reply without saving again.
    const k = KEY();
    const a = await m.setEmailPref(
      { mode: "critical_and_digest", version: 2 },
      k,
    );
    const b = await m.setEmailPref(
      { mode: "critical_and_digest", version: 2 },
      k,
    );
    expect(a).toEqual({ mode: "critical_and_digest", version: 3 });
    expect(b).toEqual(a);

    // Per person: Tunde's is still the default.
    as(TEAM_EMAILS.tunde);
    expect(await m.getEmailPref()).toEqual({ mode: "off", version: 1 });
  });

  it("refuses an unknown mode or a missing version with 422", async () => {
    const { m } = setup();
    expect(
      await failure(
        m.setEmailPref(
          { mode: "always" as unknown as "off", version: 1 },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.setEmailPref(
          { mode: "off" } as unknown as { mode: "off"; version: number },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
  });

  it("an auditor's preference read and write are 403", async () => {
    const { m } = setup({}, TEAM_EMAILS.amara);
    expect(await failure(m.getEmailPref())).toEqual([403, "forbidden"]);
    expect(
      await failure(m.setEmailPref({ mode: "critical", version: 1 }, KEY())),
    ).toEqual([403, "forbidden"]);
  });

  it("saving the preference is not logged as admin activity", async () => {
    const { m } = setup();
    const before = (await m.listActivity({})).events.length;
    await m.setEmailPref({ mode: "critical", version: 1 }, KEY());
    expect((await m.listActivity({})).events.length).toBe(before);
  });
});
