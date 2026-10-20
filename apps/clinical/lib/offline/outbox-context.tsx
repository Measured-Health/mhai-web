"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getClient } from "../api/client";
import type { FeedbackIn, QueryCreateIn } from "../api/contract";
import { useToast } from "@mhai/ui/toast";
import { ApiError } from "../api/errors";
import { useAuth } from "../auth/auth-context";
import { isClinical } from "../auth/types";
import { shouldRetry, useNetwork } from "@mhai/api-client/network";
import { titleFor, useSession } from "../session-store";
import { ownerId } from "./crypto";
import { createOutbox, type OutboxItem } from "./outbox";

type Ctx = {
  items: OutboxItem[];
  syncing: boolean;
  /** localId → the real query id, once a queued question reached the server. */
  resolved: Record<string, string>;
  /** The signed-in user's owner id is known. */
  ready: boolean;
  /** The first read of this user's items has finished. */
  loaded: boolean;
  /** The last read failed (no usable storage): `items` may be incomplete. */
  loadError: boolean;
  queueQuery(q: QueryCreateIn): Promise<string>;
  /** `idempotencyKey`: the key of a send that may have reached the server. */
  queueFeedback(f: FeedbackIn, idempotencyKey?: string): Promise<void>;
  /** `id` is the item id or a question's localId. */
  discard(id: string): Promise<void>;
  clearMine(): Promise<void>;
  syncNow(): void;
};

const notSignedIn = () => Promise.reject(new Error("Not signed in"));
const EMPTY: OutboxItem[] = [];
const NO_IDS: Record<string, string> = {};
/** Outside the provider (component tests): nothing queued, nothing to do. */
const INERT: Ctx = {
  items: EMPTY,
  syncing: false,
  resolved: NO_IDS,
  ready: false,
  loaded: true,
  loadError: false,
  queueQuery: notSignedIn,
  queueFeedback: notSignedIn,
  discard: async () => {},
  clearMine: async () => {},
  syncNow: () => {},
};

const OutboxCtx = createContext<Ctx>(INERT);
const box = createOutbox();

type Who = { username: string; owner: string };
/** State for one user; a different signed-in user reads as empty. */
type Mine = Who & {
  items: OutboxItem[];
  loaded: boolean;
  loadError: boolean;
  resolved: Record<string, string>;
};

/** The owner, once known; queueing waits on it right after sign-in. */
type OwnerWait = {
  promise: Promise<Who>;
  resolve(w: Who): void;
  reject(e: Error): void;
  settled: boolean;
};
function ownerWait(): OwnerWait {
  const d = { settled: false } as OwnerWait;
  d.promise = new Promise<Who>((res, rej) => {
    d.resolve = (w) => {
      d.settled = true;
      res(w);
    };
    d.reject = (e) => {
      d.settled = true;
      rej(e);
    };
  });
  d.promise.catch(() => {}); // a rejection nobody awaited isn't an error
  return d;
}

/** Unsent questions and feedback, encrypted on this device, synced when online. */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const { user, status, steps } = useAuth();
  const session = useSession();
  const toast = useToast();
  const { online } = useNetwork();
  const username = status === "signed_in" && user ? user.username : null;
  // Sending needs the clinical API: a clinician who finished first sign-in.
  // Anyone else's items are kept (and listed), never sent or dropped.
  const canSend =
    status === "signed_in" && isClinical(user) && steps.length === 0;
  const [mine, setMine] = useState<Mine | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Bumped to start a sync from an event: the sync itself runs in an effect.
  const [kick, setKick] = useState(0);
  // Written in effects and handlers only (never during render).
  const who = useRef<OwnerWait | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const gen = useRef(0);
  // Bumped whenever the signed-in user changes: a sync started for someone
  // else stops at its next step and never touches this user's state.
  const epoch = useRef(0);

  // The signed-in user changed (sign-out included): drop the previous user's
  // decrypted items now, during render, so nothing of theirs stays in memory.
  const [mineFor, setMineFor] = useState(username);
  if (mineFor !== username) {
    setMineFor(username);
    setMine(null);
  }
  // Latest signed-in user, for async work that finishes after a change.
  const current = useRef(username);

  const cur = mine && mine.username === username ? mine : null;
  const owner = cur?.owner ?? null;
  const items = cur?.items ?? EMPTY;
  const resolved = cur?.resolved ?? NO_IDS;
  const loaded = username === null || (cur?.loaded ?? false);
  const loadError = cur?.loadError ?? false;

  useEffect(() => {
    epoch.current++;
    current.current = username;
    gen.current++; // a read started for the previous user is never applied
  }, [username]);

  /** Reads the items again; only the most recent read is applied. */
  const load = useCallback(async (w: Who) => {
    const n = ++gen.current;
    let list: OutboxItem[] = [];
    let failed = false;
    try {
      list = await box.list(w.owner);
    } catch {
      failed = true; // no usable storage, or the key couldn't be read
    }
    // Only for the user still signed in: never bring back someone's items.
    if (n === gen.current && w.username === current.current)
      setMine((m) => ({
        ...w,
        items: list,
        loaded: true,
        loadError: failed,
        resolved: m?.username === w.username ? m.resolved : {},
      }));
    return list;
  }, []);

  // Questions saved in an earlier session show in history while they wait.
  const restore = useEffectEvent((list: OutboxItem[]) => {
    for (const i of list)
      if (i.kind === "query" && !session.get(i.payload.localId))
        session.add({
          id: i.payload.localId,
          title: titleFor(i.payload.q),
          urgency: i.payload.q.urgency,
          createdAt: i.createdAt,
          query: i.payload.q,
          pending: i.status,
        });
  });

  useEffect(() => {
    if (!username) {
      // Still loading: callers keep waiting. Signed out: they fail.
      if (status === "signed_out") {
        who.current?.reject(new Error("Not signed in"));
        const done = ownerWait();
        done.reject(new Error("Not signed in"));
        who.current = done;
      }
      return;
    }
    let on = true;
    const wait =
      who.current && !who.current.settled
        ? who.current
        : (who.current = ownerWait());
    void ownerId(username).then(async (o) => {
      if (!on) return; // the next user's effect settles `wait`
      const w = { username, owner: o };
      wait.resolve(w);
      setMine((m) =>
        m?.username === username && m.loaded
          ? m
          : { ...w, items: [], loaded: false, loadError: false, resolved: {} },
      );
      const list = await load(w);
      if (on) restore(list);
    });
    return () => {
      on = false;
    };
  }, [username, status, load]);

  const sync = useEffectEvent(async () => {
    // Offline: nothing to try (and no "Sending…" flash).
    if (!cur || !canSend || !navigator.onLine) return;
    if (running.current) {
      again.current = true;
      return;
    }
    const w: Who = { username: cur.username, owner: cur.owner };
    const start = epoch.current;
    const stale = () => epoch.current !== start;
    let droppedFeedback = false;
    running.current = true;
    setSyncing(true);
    try {
      let stop = false;
      do {
        again.current = false;
        const list = await box.list(w.owner);
        for (const item of list) {
          if (stale() || !navigator.onLine) return;
          if (item.status === "failed") continue;
          try {
            if (item.kind === "query") {
              const { q, localId } = item.payload;
              const { query_id } = await getClient().createQuery(q, {
                idempotencyKey: item.idempotencyKey,
              });
              // Signed out meanwhile: leave it for this user's next sign-in
              // (the same key makes the resend safe).
              if (stale()) return;
              await box.remove(item.id);
              if (stale()) return;
              session.replaceId(localId, query_id, {
                id: query_id,
                title: titleFor(q),
                urgency: q.urgency,
                createdAt: item.createdAt,
                query: q,
              });
              setMine((m) =>
                m?.username === w.username
                  ? { ...m, resolved: { ...m.resolved, [localId]: query_id } }
                  : m,
              );
            } else {
              await getClient().sendFeedback(item.payload.f, {
                idempotencyKey: item.idempotencyKey,
              });
              if (stale()) return;
              await box.remove(item.id);
            }
          } catch (e) {
            if (stale()) return;
            const code = e instanceof ApiError ? e.status : 0;
            if (code === 401) return; // auth signs out
            // Network, 5xx, timeout, rate limit or not allowed (yet): keep
            // everything and try again at the next trigger.
            if (
              code === 403 ||
              code === 408 ||
              code === 429 ||
              shouldRetry(0, e)
            ) {
              stop = true;
              break;
            }
            if (item.kind === "feedback") {
              // Rejected feedback can't be edited: drop it, and say so.
              await box.remove(item.id);
              droppedFeedback = true;
            } else {
              await box.markFailed(item.id, "rejected");
              if (stale()) return;
              session.update(item.payload.localId, { pending: "failed" });
            }
          }
        }
      } while (!stop && again.current && !stale());
    } finally {
      running.current = false;
      setSyncing(false);
      if (!stale()) {
        if (droppedFeedback)
          toast.show({
            title: "Some feedback couldn't be sent and was removed.",
            tone: "info",
          });
        await load(w);
      } else if (again.current) {
        // Someone else kicked a sync while this one was stopping.
        setKick((n) => n + 1);
      }
    }
  });

  // Triggers: sign-in (owner known), first sign-in finished, reconnect, a new
  // item, syncNow, and every 30 s while items wait. The sync checks
  // navigator.onLine itself.
  useEffect(() => {
    // A storage failure (read, remove or mark) waits for the next trigger.
    if (owner && canSend) sync().catch(() => {});
  }, [owner, online, kick, canSend]);
  useEffect(() => {
    const go = () => setKick((n) => n + 1);
    window.addEventListener("online", go);
    return () => window.removeEventListener("online", go);
  }, []);
  const waiting = items.some((i) => i.status === "waiting");
  useEffect(() => {
    if (!waiting || !online) return;
    const t = setInterval(() => setKick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [waiting, online]);
  // The items are stored and survive closing the tab; while offline the
  // browser still asks the user to confirm leaving.
  useEffect(() => {
    if (!waiting || online) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [waiting, online]);

  const value = useMemo<Ctx>(
    () => ({
      items,
      syncing,
      resolved,
      ready: owner !== null,
      loaded,
      loadError,
      async queueQuery(q) {
        const w = await (who.current ??= ownerWait()).promise;
        const localId = `local-${crypto.randomUUID()}`;
        await box.add(w.owner, "query", { q, localId });
        await load(w);
        setKick((n) => n + 1);
        return localId;
      },
      async queueFeedback(f, idempotencyKey) {
        const w = await (who.current ??= ownerWait()).promise;
        await box.add(w.owner, "feedback", { f }, idempotencyKey);
        await load(w);
        setKick((n) => n + 1);
      },
      async discard(id) {
        const w = await (who.current ??= ownerWait()).promise;
        const found = (await box.list(w.owner)).find(
          (i) =>
            i.id === id || (i.kind === "query" && i.payload.localId === id),
        );
        if (found) await box.remove(found.id);
        await load(w);
      },
      async clearMine() {
        const w = await (who.current ??= ownerWait()).promise;
        await box.clearOwner(w.owner);
        await load(w);
      },
      syncNow: () => setKick((n) => n + 1),
    }),
    [items, syncing, resolved, owner, loaded, loadError, load],
  );
  return <OutboxCtx.Provider value={value}>{children}</OutboxCtx.Provider>;
}

/** The offline outbox; inert (nothing queued) outside OutboxProvider. */
export function useOutbox(): Ctx {
  return useContext(OutboxCtx);
}
