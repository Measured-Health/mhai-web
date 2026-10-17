"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QueryCreateIn, Urgency } from "./api/contract";
import { clearPrefill } from "./notifications/ask";
import { RESULT_LABEL, type ResultKind } from "./labels";

export interface SessionItem {
  id: string;
  title: string;
  urgency: Urgency;
  createdAt: number;
  kind?: ResultKind | "failed";
  flagged?: boolean;
  /** Epoch ms when the clinician agreed with (or reviewed) the result. */
  agreedAt?: number;
  /** Feedback already sent for this result; survives navigating away and back. */
  feedback?: "agree" | "correct" | "reviewed";
  /** Primary diagnosis text, set once a result is loaded; searched by history. */
  diagnosis?: string;
  /** The confidence label the result screen showed; null when it showed none. */
  confidenceLabel?: string | null;
  /** Saved offline (lib/offline): not on the server yet, or rejected by it. */
  pending?: "waiting" | "failed";
  query: QueryCreateIn;
}

/**
 * History status in plain language, matching what the result screen showed:
 * "Completed" (no dot) when a completed result had no confidence level.
 */
export function historyStatus(i: SessionItem): {
  label: string;
  dot: ResultKind | "failed" | null;
} {
  if (i.pending === "waiting") return { label: "Waiting to send", dot: null };
  if (i.pending === "failed") return { label: "Couldn't send", dot: "failed" };
  if (!i.kind) return { label: "Analysing", dot: null };
  if (i.kind === "review" || i.kind === "failed")
    return { label: RESULT_LABEL[i.kind], dot: i.kind };
  return i.confidenceLabel
    ? { label: i.confidenceLabel, dot: i.kind }
    : { label: "Completed", dot: null };
}

type Ctx = {
  items: SessionItem[];
  add(i: SessionItem): void;
  update(id: string, p: Partial<SessionItem>): void;
  get(id: string): SessionItem | undefined;
  remove(id: string): void;
  /**
   * An offline question reached the server: rename it and clear `pending`.
   * Adds `fallback` instead when this session doesn't have `from`.
   */
  replaceId(from: string, to: string, fallback?: SessionItem): void;
  clear(): void;
};
const SessionCtx = createContext<Ctx | null>(null);

/** Session-only history: React state, never storage (Build Guide; CONTRIBUTING). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<SessionItem[]>([]);
  const add = useCallback(
    (i: SessionItem) => setItems((x) => [i, ...x.filter((y) => y.id !== i.id)]),
    [],
  );
  const update = useCallback(
    (id: string, p: Partial<SessionItem>) =>
      setItems((x) => x.map((y) => (y.id === id ? { ...y, ...p } : y))),
    [],
  );
  const remove = useCallback(
    (id: string) => setItems((x) => x.filter((y) => y.id !== id)),
    [],
  );
  const replaceId = useCallback(
    (from: string, to: string, fallback?: SessionItem) =>
      setItems((x) => {
        const found = x.find((y) => y.id === from);
        const rest = x.filter((y) => y.id !== to);
        if (found)
          return rest.map((y) => {
            if (y.id !== from) return y;
            const next = { ...y, id: to };
            delete next.pending;
            return next;
          });
        return fallback ? [{ ...fallback, id: to }, ...rest] : x;
      }),
    [],
  );
  // Sign-out: drop history, cached clinical results held in memory and any
  // consultation waiting to be filled from a patient alert.
  const clear = useCallback(() => {
    setItems([]);
    queryClient.clear();
    clearPrefill();
  }, [queryClient]);
  const value = useMemo(
    () => ({
      items,
      add,
      update,
      remove,
      replaceId,
      clear,
      get: (id: string) => items.find((i) => i.id === id),
    }),
    [items, add, update, remove, replaceId, clear],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

export const titleFor = (q: QueryCreateIn) =>
  `${q.patient_data.symptoms[0] ?? "Consultation"}, ${q.patient_data.age} ${({ male: "M", female: "F", other: "X", unknown: "?" } as const)[q.patient_data.sex]}`;
