"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QueryCreateIn, Urgency } from "./api/contract";
import type { ResultKind } from "./labels";

export interface SessionItem {
  id: string;
  title: string;
  urgency: Urgency;
  createdAt: number;
  kind?: ResultKind | "failed";
  flagged?: boolean;
  /** Primary diagnosis text, set once a result is loaded; searched by history. */
  diagnosis?: string;
  query: QueryCreateIn;
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
  const clear = useCallback(() => setItems([]), []);
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
