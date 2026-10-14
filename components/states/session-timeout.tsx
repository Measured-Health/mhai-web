"use client";
import { useRouter } from "next/navigation";
import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { useIdle } from "@/lib/hooks/use-idle";
import { useSession } from "@/lib/session-store";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

type Timing = { warnAfterMs?: number; signOutAfterMs?: number };

/**
 * Warns at lastActivity + `warnAfterMs` (13 min) and signs out at
 * lastActivity + `signOutAfterMs` (15 min). Both are wall-clock deadlines,
 * re-checked on every tick and on wake (visibilitychange, pageshow, focus),
 * so sleep or a throttled tab can't keep a session open past its deadline.
 * Plan 1 sign-out clears the session history and the query cache
 * (`session.clear()`), goes to `/`, and says why. Plan 2 swaps in real auth.
 */
export function SessionTimeout({
  warnAfterMs = 780_000,
  signOutAfterMs = 900_000,
  onSignOut,
}: Timing & {
  /** Lets the app drop in-memory page state (an open draft) on sign-out. */
  onSignOut?(): void;
}) {
  // Sign-out deadline while the warning is showing; null otherwise.
  const [deadline, setDeadline] = useState<number | null>(null);
  // "Now" for the countdown, set by ticks and wake events (no Date.now() in render).
  const [now, setNow] = useState(0);
  const { clear } = useSession();
  const router = useRouter();
  const { show } = useToast();

  const expired = deadline !== null && now >= deadline;
  const open = deadline !== null && !expired;

  const restart = useIdle(warnAfterMs, (lastActivityAt) => {
    if (open) return;
    // Already past (woken from sleep)? `expired` below signs out at once.
    setNow(Date.now());
    setDeadline(lastActivityAt + signOutAfterMs);
  });

  useEffect(() => {
    if (!open) return;
    const check = () => setNow(Date.now());
    const t = setInterval(check, 1000);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [open]);

  // Leaves `deadline` in the past (dialog closed) until the next idle period.
  const signOut = useEffectEvent(() => {
    restart();
    // One transition, so the cleared history and the new route land together
    // (a result page never renders with its session item gone).
    startTransition(() => {
      clear();
      onSignOut?.();
      router.push("/");
    });
    show({
      title: "Signed out for privacy",
      body: "Your session was cleared after inactivity.",
    });
  });
  // The only sign-out path: the deadline has passed (or "Sign out now").
  // Keyed on `deadline` too, so each idle period that expires signs out,
  // even when the previous one had already expired.
  useEffect(() => {
    if (expired) signOut();
  }, [expired, deadline]);

  // Stay, Esc and backdrop cancel all restart the idle period, unless the
  // deadline has already passed (stale countdown): then sign out instead.
  const stay = () => {
    const t = Date.now();
    if (deadline !== null && t >= deadline) {
      setNow(t);
      return;
    }
    setDeadline(null);
    restart();
  };
  const left = open ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  return (
    <Dialog open={open} onClose={stay} title="Still there?">
      <p className="mb-[18px] text-[14.5px] leading-normal text-ink-2">
        For patient privacy you&apos;ll be signed out in{" "}
        <b className="font-mono tabular text-warn-deep">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </b>{" "}
        because of inactivity.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={stay}>Stay signed in</Button>
        <Button variant="ghost" onClick={() => setDeadline(now)}>
          Sign out now
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Mounted once in Providers (root layout), so every route, including
 * /print, has the idle sign-out. On sign-out it remounts the app below it,
 * dropping any in-memory page state such as an open draft.
 */
export function SessionGuard({
  children,
  ...timing
}: Timing & { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const onSignOut = useCallback(() => setEpoch((n) => n + 1), []);
  return (
    <>
      <Fragment key={epoch}>{children}</Fragment>
      <SessionTimeout {...timing} onSignOut={onSignOut} />
    </>
  );
}
