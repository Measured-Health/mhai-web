import type { FeedbackIn, QueryCreateIn } from "../api/contract";
import { decrypt, deviceKey, encrypt, type Sealed } from "./crypto";
import { idbAll, idbDelete, idbPut, outboxExists } from "./db";

export const OUTBOX_TTL_MS = 72 * 3_600_000;
export const isLocalId = (id: string) => id.startsWith("local-");

export interface OutboxPayload {
  query: { q: QueryCreateIn; localId: string };
  feedback: { f: FeedbackIn };
}
export type OutboxKind = keyof OutboxPayload;
type Status = "waiting" | "failed";
interface Entry {
  id: string;
  owner: string;
  kind: OutboxKind;
  createdAt: number;
  /** Strictly increasing, so items added in one millisecond keep their order. */
  seq: number;
  idempotencyKey: string;
  status: Status;
  error?: string;
  sealed: Sealed;
}
export type OutboxItem = {
  [K in OutboxKind]: {
    id: string;
    kind: K;
    createdAt: number;
    seq: number;
    idempotencyKey: string;
    status: Status;
    error?: string;
    payload: OutboxPayload[K];
  };
}[OutboxKind];

let counter = 0;

const toItem = (e: Entry, payload: unknown) =>
  ({
    id: e.id,
    kind: e.kind,
    createdAt: e.createdAt,
    seq: e.seq,
    idempotencyKey: e.idempotencyKey,
    status: e.status,
    ...(e.error ? { error: e.error } : {}),
    payload,
  }) as OutboxItem;

/** Unsent questions and feedback, AES-GCM encrypted in IndexedDB. */
export function createOutbox({
  key,
  now = () => Date.now(),
}: { key?: Promise<CryptoKey>; now?: () => number } = {}) {
  let k: Promise<CryptoKey> | undefined;
  // A key that failed to load isn't kept: the next call tries again.
  const keep = (p: Promise<CryptoKey>) => {
    k = p;
    p.catch(() => {
      if (k === p) k = undefined;
    });
    return p;
  };
  if (key) keep(key);
  const getKey = () => k ?? keep(deviceKey());

  return {
    async add<K extends OutboxKind>(
      owner: string,
      kind: K,
      payload: OutboxPayload[K],
      /** Reuse the key of a send that may have reached the server. */
      idempotencyKey: string = crypto.randomUUID(),
    ): Promise<OutboxItem> {
      const createdAt = now();
      const entry: Entry = {
        id: crypto.randomUUID(),
        owner,
        kind,
        createdAt,
        seq: createdAt * 1000 + (counter++ % 1000),
        idempotencyKey,
        status: "waiting",
        sealed: await encrypt(payload, await getKey()),
      };
      await idbPut("items", entry);
      return toItem(entry, payload);
    },

    /** This owner's items, oldest first. Purges expired items for everyone. */
    async list(owner: string): Promise<OutboxItem[]> {
      if (!(await outboxExists())) return [];
      const out: OutboxItem[] = [];
      let key: CryptoKey | undefined;
      const entries = (await idbAll<Entry>("items")).sort(
        (a, b) => a.seq - b.seq,
      );
      for (const e of entries) {
        if (now() - e.createdAt > OUTBOX_TTL_MS) {
          await idbDelete("items", e.id);
          continue;
        }
        if (e.owner !== owner) continue;
        // A key or database failure throws from here: nothing is deleted.
        key ??= await getKey();
        let payload: unknown;
        try {
          payload = await decrypt(e.sealed, key);
        } catch {
          await idbDelete("items", e.id); // unreadable (key gone): useless, so delete
          continue;
        }
        out.push(toItem(e, payload));
      }
      return out;
    },

    remove: (id: string) => idbDelete("items", id),

    async markFailed(id: string, error: string) {
      const e = (await idbAll<Entry>("items")).find((x) => x.id === id);
      if (e) await idbPut("items", { ...e, status: "failed", error });
    },

    async clearOwner(owner: string) {
      if (!(await outboxExists())) return;
      for (const e of await idbAll<Entry>("items"))
        if (e.owner === owner) await idbDelete("items", e.id);
    },
  };
}
