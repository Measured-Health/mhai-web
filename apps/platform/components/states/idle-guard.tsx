"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError } from "@/lib/auth/types";
import { useIdle } from "@mhai/ui/hooks/use-idle";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";

/** The screen warns at 13 minutes without activity... */
export const WARN_AFTER_MS = 780_000;
/** ...and signs out at 15, as the server does (spec §4). */
export const SIGN_OUT_AFTER_MS = 900_000;
/** Activity tells the server at most this often (ruling R9). */
export const KEEP_ALIVE_EVERY_MS = 60_000;

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

type Timing = {
  warnAfterMs?: number;
  signOutAfterMs?: number;
  keepAliveEveryMs?: number;
};

/**
 * The 15-minute idle sign-out, mounted once for every signed-in screen.
 * Activity (and "Stay signed in") keeps the server's session alive, so the
 * two idle clocks agree; a keep-alive that finds the session over signs out
 * with the reason "expired".
 */
export function IdleGuard(timing: Timing) {
  const { status } = useAuth();
  return status === "signed_in" ? <IdleTimer {...timing} /> : null;
}

function IdleTimer({
  warnAfterMs = WARN_AFTER_MS,
  signOutAfterMs = SIGN_OUT_AFTER_MS,
  keepAliveEveryMs = KEEP_ALIVE_EVERY_MS,
}: Timing) {
  const { client, signOut } = useAuth();
  // Sign-out deadline while the warning shows; null otherwise.
  const [deadline, setDeadline] = useState<number | null>(null);
  // "Now", set by ticks and wake events (no Date.now() in render).
  const [now, setNow] = useState(0);
  const expired = deadline !== null && now >= deadline;
  const open = deadline !== null && !expired;

  const restart = useIdle(warnAfterMs, (lastActivityAt) => {
    if (open) return;
    // Already past (woken from sleep)? `expired` signs out at once.
    setNow(Date.now());
    setDeadline(lastActivityAt + signOutAfterMs);
  });

  // When the server was last told: the sign-in itself just told it.
  const lastPing = useRef(0);
  useEffect(() => {
    lastPing.current = Date.now();
  }, []);
  const keepAlive = useCallback(() => {
    lastPing.current = Date.now();
    client.keepAlive().catch((e: unknown) => {
      // The server's session is over: sign out now. A network error isn't.
      if (e instanceof AuthError && e.code === "session_expired")
        void signOut("expired");
    });
  }, [client, signOut]);

  useEffect(() => {
    // While the warning shows, only "Stay signed in" keeps the session.
    if (open) return;
    const onActivity = () => {
      if (Date.now() - lastPing.current >= keepAliveEveryMs) keepAlive();
    };
    const opts = { passive: true, capture: true } as const;
    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, opts));
    document.addEventListener("scroll", onActivity, opts);
    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity, opts));
      document.removeEventListener("scroll", onActivity, opts);
    };
  }, [open, keepAliveEveryMs, keepAlive]);

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

  const idleSignOut = useEffectEvent(() => void signOut("idle"));
  useEffect(() => {
    if (expired) idleSignOut();
  }, [expired]);

  // Stay, Esc and the backdrop all keep the session, unless the deadline
  // has already passed (a stale warning): then it signs out instead.
  const stay = () => {
    const t = Date.now();
    if (deadline !== null && t >= deadline) {
      setNow(t);
      return;
    }
    setDeadline(null);
    restart();
    keepAlive();
  };

  return (
    <Dialog
      open={open}
      onClose={stay}
      title="You'll be signed out in 2 minutes"
    >
      <p className="mb-[18px] text-[14.5px] leading-normal text-ink-2">
        For security, the platform signs you out after 15 minutes without
        activity.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={stay}>Stay signed in</Button>
        <Button variant="ghost" onClick={() => void signOut("manual")}>
          Sign out now
        </Button>
      </div>
    </Dialog>
  );
}
