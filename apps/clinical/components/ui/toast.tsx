"use client";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";
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
import { cn } from "./cn";

export type ToastSeverity = "critical" | "urgent" | "info";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: "ok" | "info";
  /** How long it stays (3.2 s by default); null keeps it until hidden. */
  ms?: number | null;
  /** A pop-up's "View" button: it hides the pop-up, then runs. */
  action?: { label: string; name: string; onClick(): void };
  /** Pop-ups are read out through the page's live regions (R4). */
  live?: "polite" | "assertive";
  /** Shows the severity's icon; the title carries the word. */
  severity?: ToastSeverity;
  /** Lets a group be cleared together, e.g. at sign-out (R4). */
  tag?: string;
}

type Item = ToastInput & { id: number };
type Said = { text: string; id: number };

/** At most this many on screen; the oldest that can expire goes first, never a Critical (R4, A11). */
export const TOAST_MAX = 4;
const DEFAULT_MS = 3200;

type Ctx = {
  show(t: ToastInput): number;
  dismiss(id: number): void;
  clear(tag: string): void;
};
const ToastCtx = createContext<Ctx>({
  show: () => 0,
  dismiss() {},
  clear() {},
});
export const useToast = () => useContext(ToastCtx);

const ICON = {
  critical: OctagonAlert,
  urgent: AlertTriangle,
  info: Info,
} as const;
const RING = {
  critical: "ring-bad-line text-bad-deep",
  urgent: "ring-warn-line text-warn-deep",
  info: "ring-line text-ink-2",
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  // One line per pop-up, so a burst is read out in full (F1).
  const [polite, setPolite] = useState<Said[]>([]);
  const [assertive, setAssertive] = useState<Said[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const itemsRef = useRef<Item[]>([]);
  const seq = useRef(0);

  // Nothing may fire, or keep patient text, after the provider is gone.
  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const h of live.values()) clearTimeout(h);
      live.clear();
    };
  }, []);

  // The live text belongs to one toast: it goes when that toast goes (A10).
  const remove = useCallback((gone: (i: Item) => boolean) => {
    const ids = new Set(itemsRef.current.filter(gone).map((i) => i.id));
    if (!ids.size) return;
    for (const id of ids) {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    }
    itemsRef.current = itemsRef.current.filter((i) => !ids.has(i.id));
    setItems(itemsRef.current);
    const quiet = (s: Said[]) =>
      s.some((x) => ids.has(x.id)) ? s.filter((x) => !ids.has(x.id)) : s;
    setPolite(quiet);
    setAssertive(quiet);
  }, []);

  const dismiss = useCallback(
    (id: number) => remove((i) => i.id === id),
    [remove],
  );

  const show = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      let next = [...itemsRef.current, { ...t, id }];
      // Over the cap: the oldest that can expire goes, then the oldest
      // persistent non-Critical. Never the new one, never a Critical (A11).
      while (next.length > TOAST_MAX) {
        const others = next.filter(
          (i) => i.id !== id && i.severity !== "critical",
        );
        const out = others.find((i) => i.ms !== null) ?? others[0];
        if (!out) break;
        remove((i) => i.id === out.id);
        next = next.filter((i) => i.id !== out.id);
      }
      itemsRef.current = next;
      setItems(next);
      if (t.live) {
        // Each pop-up adds its own line, keyed by id, so even the same
        // words are read again and a burst is read in full.
        const said = { text: [t.title, t.body].filter(Boolean).join(". "), id };
        const add = (s: Said[]) => [...s, said];
        if (t.live === "assertive") setAssertive(add);
        else setPolite(add);
      }
      if (t.ms !== null)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), t.ms ?? DEFAULT_MS),
        );
      return id;
    },
    [dismiss, remove],
  );

  const clear = useCallback(
    (tag: string) => remove((i) => i.tag === tag),
    [remove],
  );

  const value = useMemo(
    () => ({ show, dismiss, clear }),
    [show, dismiss, clear],
  );
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* Always in the page, so screen readers hear what's added (spec §6). */}
      {/* Only additions are read, so lines already said aren't repeated. */}
      <div aria-live="polite" aria-relevant="additions" className="sr-only">
        {polite.map((s) => (
          <span key={s.id}>{s.text}</span>
        ))}
      </div>
      <div aria-live="assertive" aria-relevant="additions" className="sr-only">
        {assertive.map((s) => (
          <span key={s.id}>{s.text}</span>
        ))}
      </div>
      {/* Below the top bar, so a pop-up never covers the bell (R4). */}
      <div className="pointer-events-none fixed right-5 print:hidden top-[calc(var(--demo-h,0px)+4.75rem)] z-50 flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.severity ? ICON[t.severity] : null;
          const action = t.action;
          return (
            <div
              key={t.id}
              data-toast
              role={t.live ? undefined : "status"}
              className={cn(
                "pointer-events-auto animate-[toastIn_var(--t-slow)_var(--e-spring)_both] rounded-2xl bg-white p-4 text-[13.5px] shadow-[0_30px_60px_-24px_#1c0d2299] ring-1",
                t.severity ? RING[t.severity] : "ring-line",
              )}
            >
              <div className="flex items-start gap-2.5">
                {Icon && (
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1 text-ink">
                  <b className="block [overflow-wrap:anywhere]">{t.title}</b>
                  {t.body && (
                    <p className="mt-1 text-xs text-ink-3 [overflow-wrap:anywhere]">
                      {t.body}
                    </p>
                  )}
                  {action && (
                    <button
                      type="button"
                      aria-label={action.name}
                      onClick={() => {
                        dismiss(t.id);
                        action.onClick();
                      }}
                      className="mt-2 inline-flex min-h-11 items-center rounded-full bg-lilac px-3.5 text-[12.5px] font-semibold text-bloom focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep sm:min-h-8"
                    >
                      {action.label}
                    </button>
                  )}
                </div>
                {(action || t.ms === null) && (
                  <button
                    type="button"
                    aria-label={`Hide pop-up: ${t.title}${t.body ? `, ${t.body}` : ""}`}
                    onClick={() => dismiss(t.id)}
                    className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep sm:size-8"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
