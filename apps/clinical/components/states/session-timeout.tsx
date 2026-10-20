"use client";
import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useIdle } from "@mhai/ui/hooks/use-idle";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useToast } from "@mhai/ui/toast";

type Timing = { warnAfterMs?: number; signOutAfterMs?: number };

/**
 * Warns at lastActivity + `warnAfterMs` (13 min) and signs out at
 * lastActivity + `signOutAfterMs` (15 min). Both are wall-clock deadlines,
 * re-checked on every tick and on wake (visibilitychange, pageshow, focus),
 * so sleep or a throttled tab can't keep a session open past its deadline.
 * Sign-out is handed to `onSignOut` (SessionGuard passes
 * `useAuth().signOut("idle")`, which clears the history and cache and goes to
 * sign-in); this component only shows the warning and the toast.
 */
export function SessionTimeout({
  warnAfterMs = 780_000,
  signOutAfterMs = 900_000,
  onSignOut,
}: Timing & {
  /** Does the actual sign-out (and drops in-memory page state). */
  onSignOut(): void;
}) {
  // Sign-out deadline while the warning is showing; null otherwise.
  const [deadline, setDeadline] = useState<number | null>(null);
  // "Now" for the countdown, set by ticks and wake events (no Date.now() in render).
  const [now, setNow] = useState(0);
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
    onSignOut();
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
 * /print, has the idle sign-out while someone is signed in. On sign-out it
 * remounts the app below it, dropping in-memory page state such as an open
 * draft. Why they were signed out is kept by AuthProvider (memory only).
 */
export function SessionGuard({
  children,
  ...timing
}: Timing & { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const { status, signOut } = useAuth();
  const onSignOut = useCallback(() => {
    // Same transition as signOut's clear/SIGNED_OUT/replace (they are
    // batched), so the remount never commits while still signed in.
    startTransition(() => setEpoch((n) => n + 1));
    void signOut("idle");
  }, [signOut]);
  return (
    <>
      <Fragment key={epoch}>{children}</Fragment>
      {status === "signed_in" && (
        <SessionTimeout {...timing} onSignOut={onSignOut} />
      )}
    </>
  );
}
