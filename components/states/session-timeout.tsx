"use client";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useIdle } from "@/lib/hooks/use-idle";
import { useSession } from "@/lib/session-store";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

/**
 * Warns after `warnAfterMs` idle (13 min), signs out at `signOutAfterMs`
 * (15 min). Plan 1 sign-out clears the session history and the query cache
 * (`session.clear()`), goes to `/`, and says why. Plan 2 swaps in real auth.
 */
export function SessionTimeout({
  warnAfterMs = 780_000,
  signOutAfterMs = 900_000,
  onSignOut,
}: {
  warnAfterMs?: number;
  signOutAfterMs?: number;
  /** Lets the shell drop in-memory page state (an open draft) on sign-out. */
  onSignOut?(): void;
}) {
  // `warn` starts a countdown; the dialog shows until it reaches 0 (sign-out).
  const [warn, setWarn] = useState(false);
  const [left, setLeft] = useState(0);
  const open = warn && left > 0;
  const { clear } = useSession();
  const router = useRouter();
  const { show } = useToast();

  const signOut = useEffectEvent(() => {
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

  useIdle(warnAfterMs, () => {
    if (open) return;
    setLeft(Math.max(0, Math.round((signOutAfterMs - warnAfterMs) / 1000)));
    setWarn(true);
  });

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [open]);

  // The only sign-out path: the countdown (or "Sign out now") reaching 0.
  useEffect(() => {
    if (warn && left === 0) signOut();
  }, [warn, left]);

  const stay = () => setWarn(false);
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
        <Button variant="ghost" onClick={() => setLeft(0)}>
          Sign out now
        </Button>
      </div>
    </Dialog>
  );
}
