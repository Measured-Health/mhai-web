"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useOutbox } from "@/lib/offline/outbox-context";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/**
 * /sign-out: reached through the shell guard, so drafts are asked about first.
 * Questions or feedback still waiting on this device are asked about here.
 */
export function SignOut() {
  const { status, signOut } = useAuth();
  const { items, loaded, clearMine } = useOutbox();
  const router = useRouter();
  // signOut already lands on /sign-in; don't send a second replace after it.
  // Also set by "Sign out and delete", so emptying the outbox can't sign out twice.
  const started = useRef(false);
  const unsent = items.length;
  useEffect(() => {
    if (status === "signed_in") {
      // Wait for the outbox, and ask first when something is still unsent.
      if (started.current || !loaded || unsent > 0) return;
      started.current = true;
      void signOut("manual");
    } else if (status === "signed_out" && !started.current) {
      router.replace("/sign-in");
    }
  }, [status, signOut, router, loaded, unsent]);

  if (status !== "signed_in" || !loaded || unsent === 0) return null;
  return (
    <Dialog
      open
      onClose={() => router.back()}
      title={`You have ${unsent} unsent ${unsent === 1 ? "item" : "items"}`}
    >
      <p className="mb-[18px] text-[14.5px] leading-normal text-ink-2">
        Signing out deletes them from this device.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => router.back()}>Stay signed in</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (started.current) return;
            started.current = true;
            await clearMine();
            await signOut("manual");
          }}
        >
          Sign out and delete
        </Button>
      </div>
    </Dialog>
  );
}
