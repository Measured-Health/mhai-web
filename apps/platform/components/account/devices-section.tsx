"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { useDevices } from "@/lib/queries/account";
import { queryKeys } from "@/lib/queries/keys";
import { useNow } from "@mhai/ui/hooks/use-now";
import { AuthErrorBanner, errorCode } from "../auth/auth-error";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { useNeedsConnection } from "../states/offline-strip";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";

const ago = (t: number | null, now: number) => {
  // An unreadable time is left out rather than shown as "NaN d ago".
  if (t === null || !Number.isFinite(t)) return null;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export function DevicesSection() {
  const { client, signOut } = useAuth();
  const qc = useQueryClient();
  const now = useNow();
  const net = useNeedsConnection();
  const devices = useDevices();
  const [confirm, setConfirm] = useState(false);
  const [failed, setFailed] = useState<AuthError | null>(null);
  const [failedOne, setFailedOne] = useState<AuthError | null>(null);

  const signOutOne = async (id: string) => {
    setFailedOne(null);
    try {
      await client.signOutDevice(id);
    } catch (e) {
      const ae = errorCode(e);
      if (ae.code === "session_expired") return void signOut("expired");
      setFailedOne(ae);
      return;
    }
    await qc.invalidateQueries({ queryKey: queryKeys.devices });
  };
  const everywhere = async () => {
    setConfirm(false);
    setFailed(null);
    try {
      await client.signOutEverywhere();
    } catch (e) {
      const ae = errorCode(e);
      if (ae.code === "session_expired") return void signOut("expired");
      setFailed(ae);
      return;
    }
    await signOut("manual");
  };

  return (
    <>
      <section
        id="devices"
        aria-labelledby="devices-h"
        className="card-v3 scroll-mt-4 px-[22px] py-5"
      >
        <h2 id="devices-h" className="text-base font-semibold">
          Devices
        </h2>
        <p className="mb-3.5 mt-1 text-[13px] text-ink-3">
          Sign out anything you don&apos;t recognise.
        </p>
        {failed && (
          <AuthErrorBanner
            error={failed}
            copy={{
              title: "We couldn't sign out your other devices.",
              body: "Check your connection and try again.",
            }}
          />
        )}
        {failedOne && (
          <AuthErrorBanner
            error={failedOne}
            copy={{
              title: "We couldn't sign out that device.",
              body: "Check your connection and try again.",
            }}
          />
        )}
        {devices.isPending && <Loading label="Loading devices" />}
        {devices.isError && (
          <CouldntLoad
            what="your devices"
            onRetry={() => void devices.refetch()}
          />
        )}
        <ul className="flex flex-col divide-y divide-line">
          {devices.data?.map((d) => (
            <li key={d.id} className="flex min-h-14 items-center gap-3 py-2">
              <Monitor aria-hidden className="size-5 text-ink-3" />
              <span className="min-w-0 flex-1 text-[13.5px]">
                <span className="block truncate">{d.label}</span>
                <small className="text-ink-3">
                  {[
                    d.place,
                    d.current ? "active now" : ago(d.lastActiveAt, now),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              {d.current ? (
                <span className="rounded-full bg-lilac px-2.5 py-1 text-[11px] font-semibold text-bloom">
                  This device
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Sign out ${d.label}`}
                  disabled={net.offline}
                  title={net.props.title}
                  onClick={() => void signOutOne(d.id)}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button
          variant="danger"
          className="mt-3"
          disabled={net.offline}
          title={net.props.title}
          onClick={() => setConfirm(true)}
        >
          Sign out everywhere
        </Button>
      </section>
      {/* Outside the section, so the region holds one "Sign out everywhere". */}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Sign out everywhere?"
      >
        <p className="mb-[18px] text-[14.5px] text-ink-2">
          You&apos;ll be signed out on every device, including this one.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void everywhere()}>
            Sign out everywhere
          </Button>
        </div>
      </Dialog>
    </>
  );
}
