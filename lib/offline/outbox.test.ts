import { beforeEach, describe, expect, it } from "vitest";
import { OUTBOX_TTL_MS, createOutbox, isLocalId } from "./outbox";
import { idbAll, outboxExists } from "./db";

const Q = {
  clinical_question: "Central chest pain for 40 minutes. Likely diagnosis?",
  urgency: "urgent" as const,
  patient_data: { age: 54, sex: "male" as const, symptoms: ["Chest pain"] },
};
const key = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);

beforeEach(async () => {
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase("mhai-outbox");
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});

describe("outbox", () => {
  it("stores items encrypted, per owner, oldest first", async () => {
    let t = 1;
    const box = createOutbox({ key: key(), now: () => t++ });
    await box.add("owner-a", "query", { q: Q, localId: "local-1" });
    await box.add("owner-a", "feedback", {
      f: { query_id: "q9", action: "validate" },
    });
    await box.add("owner-b", "query", { q: Q, localId: "local-2" });
    const mine = await box.list("owner-a");
    expect(mine.map((i) => i.kind)).toEqual(["query", "feedback"]);
    expect(mine[0]!.payload).toEqual({ q: Q, localId: "local-1" });
    expect(mine[0]!.idempotencyKey).not.toBe(mine[1]!.idempotencyKey);
    const raw = JSON.stringify(await idbAll("items"), (_k, v) =>
      v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? "<bytes>" : v,
    );
    expect(raw).not.toContain("chest pain");
    expect(raw).not.toContain("Chest pain");
  });

  it("keeps the order of items added in the same millisecond", async () => {
    const box = createOutbox({ key: key(), now: () => 5 });
    for (const n of [1, 2, 3, 4, 5])
      await box.add("o", "query", { q: Q, localId: `local-${n}` });
    const ids = (await box.list("o")).map(
      (i) => i.kind === "query" && i.payload.localId,
    );
    expect(ids).toEqual([
      "local-1",
      "local-2",
      "local-3",
      "local-4",
      "local-5",
    ]);
  });

  it("removes, fails and clears items", async () => {
    const box = createOutbox({ key: key() });
    const a = await box.add("o", "query", { q: Q, localId: "local-1" });
    const b = await box.add("o", "query", { q: Q, localId: "local-2" });
    await box.markFailed(a.id, "rejected");
    expect((await box.list("o")).find((i) => i.id === a.id)?.status).toBe(
      "failed",
    );
    await box.remove(b.id);
    expect(await box.list("o")).toHaveLength(1);
    await box.clearOwner("o");
    expect(await box.list("o")).toEqual([]);
  });

  it("forgets items older than 72 hours", async () => {
    let t = 0;
    const box = createOutbox({ key: key(), now: () => t });
    await box.add("o", "query", { q: Q, localId: "local-1" });
    t = OUTBOX_TTL_MS + 1;
    expect(await box.list("o")).toEqual([]);
    expect(await idbAll("items")).toEqual([]);
  });

  it("drops items it can't decrypt (another key)", async () => {
    await createOutbox({ key: key() }).add("o", "query", {
      q: Q,
      localId: "local-1",
    });
    expect(await createOutbox({ key: key() }).list("o")).toEqual([]);
  });

  it("never creates the database just by reading", async () => {
    const box = createOutbox({ key: key() });
    expect(await box.list("o")).toEqual([]);
    await box.clearOwner("o");
    expect(await outboxExists()).toBe(false);
  });

  it("recognises local ids", () => {
    expect(isLocalId("local-abc")).toBe(true);
    expect(isLocalId("q-1")).toBe(false);
  });
});
