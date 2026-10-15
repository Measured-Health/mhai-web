"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNow } from "@/lib/hooks/use-now";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export function DevicesSection() {
  const { client, signOut } = useAuth();
  const qc = useQueryClient();
  const now = useNow();
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => client.listDevices(),
  });
  const [confirm, setConfirm] = useState(false);

  const signOutOne = async (id: string) => {
    await client.signOutDevice(id);
    await qc.invalidateQueries({ queryKey: ["devices"] });
  };
  const everywhere = async () => {
    setConfirm(false);
    await client.signOutEverywhere().catch(() => {});
    await signOut("manual");
  };

  return (
    <>
      <section
        aria-labelledby="devices-h"
        className="rounded-3xl bg-white p-5 ring-1 ring-line"
      >
        <h2
          id="devices-h"
          className="font-display text-[26px] font-black leading-none"
        >
          Devices
        </h2>
        <p className="mb-3 mt-1 text-[13.5px] text-ink-2">
          Sign out anything you don&apos;t recognise.
        </p>
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
