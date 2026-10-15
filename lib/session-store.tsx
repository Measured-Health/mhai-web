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
  // Sign-out: drop history AND cached clinical results held in memory.
  const clear = useCallback(() => {
    setItems([]);
    queryClient.clear();
  }, [queryClient]);
  const value = useMemo(
    () => ({
      items,
      add,
      update,
      clear,
      get: (id: string) => items.find((i) => i.id === id),
    }),
    [items, add, update, clear],
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
