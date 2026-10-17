"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CorrectionOut, CorrectionStatus } from "@/lib/api/contract";
import { CORRECTION_KEYS, useMyCorrections } from "@/lib/correction-queries";
import { correctionTitle, parseTime, rejectionText } from "@/lib/corrections";
import { usePopupSettings } from "@/lib/notification-queries";
import { CORRECTIONS_HREF, NOTIFICATION_TAG } from "@/lib/notifications/popups";
import { useShell } from "../shell/shell-context";
import { useToast } from "../ui/toast";

export interface DecisionNote {
  id: string;
  status: "approved" | "rejected";
  title: string;
  by: string | null;
  reason: string | null;
  at: number;
}

export const NOTES_KEPT = 50;

type Ctx = { notes: DecisionNote[]; unseen: number; markSeen(): void };
const DecisionsCtx = createContext<Ctx | null>(null);

/** Null outside a signed-in shell, so the bell can render nothing there. */
export const useDecisions = () => useContext(DecisionsCtx);

/** Decisions that are new since the last look. The first look is a baseline. */
export function newDecisions(
  prev: Map<string, CorrectionStatus> | null,
  next: CorrectionOut[],
  since: number,
  now: number,
): DecisionNote[] {
  if (!prev) return [];
  return next.flatMap((c): DecisionNote[] => {
    if (c.status !== "approved" && c.status !== "rejected") return [];
    const before = prev.get(c.id);
    const decidedAt = parseTime(c.decided_at);
    const fresh =
      before === "pending_review" ||
      (before === undefined && decidedAt !== null && decidedAt >= since);
    if (!fresh) return [];
    return [
      {
        id: c.id,
        status: c.status,
        title: correctionTitle(c),
        by: c.decided_by?.display_name ?? null,
        reason: c.status === "rejected" ? rejectionText(c.rejection) : null,
        at: decidedAt ?? now,
      },
    ];
  });
}

export function toastFor(d: DecisionNote) {
  return d.status === "approved"
    ? {
        title: "Your correction was approved",
        body: [d.title, d.by].filter(Boolean).join(" · "),
        tone: "ok" as const,
        ms: 8000,
      }
    : {
        title: "Your correction was rejected",
        body: [d.title, d.reason ? `Reason: ${d.reason}` : null]
          .filter(Boolean)
          .join(" · "),
        tone: "info" as const,
        ms: 8000,
      };
}

/**
 * Watches your corrections while you're signed in (it lives in AppShell) and
 * tells you when a reviewer decides. Memory only: the history goes when the
 * shell unmounts at sign-out. Pop-ups follow "Pop-ups for decisions on my
 * corrections"; the bell counts decisions either way (spec §4).
 */
export function DecisionsProvider({ children }: { children: ReactNode }) {
  useMyCorrections(); // keeps the poll running on every clinical screen
  const qc = useQueryClient();
  const { show } = useToast();
  const { navigate } = useShell();
  const { correction_popups } = usePopupSettings();
  const [since] = useState(() => Date.now());
  const [notes, setNotes] = useState<DecisionNote[]>([]);
  const [unseen, setUnseen] = useState(0);
  const prev = useRef<Map<string, CorrectionStatus> | null>(null);
  // Read inside the cache subscription, which outlives renders.
  const popups = useRef(correction_popups);
  const go = useRef(navigate);
  useEffect(() => {
    popups.current = correction_popups;
    go.current = navigate;
  }, [correction_popups, navigate]);

  useEffect(() => {
    const snapshot = (list: CorrectionOut[]) =>
      new Map(list.map((c) => [c.id, c.status]));
    const cached = qc.getQueryData<CorrectionOut[]>(CORRECTION_KEYS.mine);
    if (cached) prev.current = snapshot(cached);
    // Subscribing to the cache (not an effect on `data`) sees every answer,
    // including ones that arrive while another screen owns the query.
    return qc.getQueryCache().subscribe((e) => {
      if (e.type !== "updated" || e.action.type !== "success") return;
      const [a, b] = e.query.queryKey;
      if (a !== CORRECTION_KEYS.mine[0] || b !== CORRECTION_KEYS.mine[1])
        return;
      const list = (e.query.state.data ?? []) as CorrectionOut[];
      const fresh = newDecisions(prev.current, list, since, Date.now());
      prev.current = snapshot(list);
      if (!fresh.length) return;
      setNotes((n) => [...fresh, ...n].slice(0, NOTES_KEPT));
      setUnseen((u) => u + fresh.length);
      if (!popups.current) return;
      for (const d of fresh)
        show({
          ...toastFor(d),
          live: "polite",
          tag: NOTIFICATION_TAG,
          action: {
            label: "View",
            name: `View decision: ${d.title}`,
            onClick: () => go.current(CORRECTIONS_HREF),
          },
        });
    });
  }, [qc, show, since]);

  const markSeen = useCallback(() => setUnseen(0), []);
  const value = useMemo(
    () => ({ notes, unseen, markSeen }),
    [notes, unseen, markSeen],
  );
  return (
    <DecisionsCtx.Provider value={value}>{children}</DecisionsCtx.Provider>
  );
}
