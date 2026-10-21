"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useAuth, type SignOutReason } from "@/lib/auth/auth-context";
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

/** Tabs share one session, so they share its idle clock (no storage). */
export const TAB_CHANNEL = "mhai-platform-activity";
type TabMessage =
  { type: "alive"; at: number } | { type: "signed-out"; reason: SignOutReason };

/** Opens the tab channel, or does nothing where the browser has none. */
function openTabChannel(onMessage: (m: TabMessage) => void) {
  if (typeof BroadcastChannel === "undefined") return null;
  const c = new BroadcastChannel(TAB_CHANNEL);
  c.onmessage = (e: MessageEvent<TabMessage>) => onMessage(e.data);
  return c;
}

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
  const { status, signedOutReason, signOut } = useAuth();

  // A sign-out in one tab ends the shared session, so the other tabs follow
  // with the same reason, without asking the server again.
  const channel = useRef<BroadcastChannel | null>(null);
  const fromPeer = useRef(false);
  const onPeer = useEffectEvent((m: TabMessage) => {
    if (m.type !== "signed-out" || status !== "signed_in") return;
    fromPeer.current = true;
    void signOut(m.reason, { elsewhere: true });
  });
  useEffect(() => {
    const c = openTabChannel(onPeer);
    channel.current = c;
    return () => {
      c?.close();
      channel.current = null;
    };
  }, []);

  const was = useRef(status);
  useEffect(() => {
    const signedOut = was.current === "signed_in" && status === "signed_out";
    was.current = status;
    if (!signedOut) return;
    const peer = fromPeer.current;
    fromPeer.current = false;
    if (peer || !signedOutReason || signedOutReason === "not_platform") return;
    channel.current?.postMessage({
      type: "signed-out",
      reason: signedOutReason,
    } satisfies TabMessage);
  }, [status, signedOutReason]);

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

  // When a keep-alive was last sent (by any tab), and when the server last
  // confirmed one.
  const lastPing = useRef(0);
  const lastAlive = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const keepAlive = useCallback(() => {
    const sentAt = Date.now();
    lastPing.current = sentAt;
    client.keepAlive().then(
      () => {
        lastAlive.current = Math.max(lastAlive.current, sentAt);
        // The other tabs share this session: their clocks restart too.
        channel.current?.postMessage({
          type: "alive",
          at: sentAt,
        } satisfies TabMessage);
      },
      (e: unknown) => {
        // The server's session is over: sign out now. A network error isn't.
        if (e instanceof AuthError && e.code === "session_expired")
          void signOut("expired");
      },
    );
  }, [client, signOut]);

  const restart = useIdle(warnAfterMs, (lastActivityAt) => {
    if (open) return;
    // Already past (woken from sleep)? `expired` signs out at once.
    setNow(Date.now());
    // Activity between keep-alives hasn't reached the server: count from
    // whichever is older, so "Stay signed in" never arrives after the
    // server has already ended the session.
    setDeadline(Math.min(lastActivityAt, lastAlive.current) + signOutAfterMs);
  });

  // Another tab's activity reached the server: this tab's clock (and any
  // warning) starts again from it.
  const onPeer = useEffectEvent((m: TabMessage) => {
    if (m.type !== "alive") return;
    lastAlive.current = Math.max(lastAlive.current, m.at);
    lastPing.current = Math.max(lastPing.current, m.at);
    setDeadline(null);
    restart();
  });

  // After a reload or in a new tab the server's idle clock may be older
  // than this screen's: touch it once so the two agree (a session already
  // over signs out as "expired").
  const start = useEffectEvent(() => {
    lastPing.current = lastAlive.current = Date.now();
    keepAlive();
  });
  useEffect(() => {
    const c = openTabChannel(onPeer);
    channel.current = c;
    start();
    return () => {
      c?.close();
      channel.current = null;
    };
  }, []);

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
