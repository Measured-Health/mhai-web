"use client";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import type { Hospital, InviteStatus } from "@/lib/api/contract";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";

const INVITE: Record<InviteStatus, string | null> = {
  pending: "Invite pending",
  expired: "Invite expired",
  // Accepted, but that admin is no longer active: nothing pending to chase.
  accepted: null,
};

export const openHospitalClass =
  "inline-flex min-h-11 items-center font-semibold text-mint-deep underline underline-offset-2";

/**
 * Who to contact at the hospital: its active hospital admins, not just the
 * first one invited. With none: say so, where the first-admin invite
 * stands, and the way to the hospital's page (Review Focus 5).
 */
export function ContactAdmins({ hospital: h }: { hospital: Hospital }) {
  const titleId = useId();
  const toast = useToast();
  const copy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.show({ title: "Email copied", tone: "ok" });
    } catch {
      toast.show({ title: "Couldn't copy. Select the email instead." });
    }
  };
  const invite = h.first_admin ? INVITE[h.first_admin.status] : null;

  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="mb-2 text-[14px] font-semibold">
        Hospital admin
      </h3>
      {h.admins.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {h.admins.map((a) => (
            <li
              key={a.email}
              className="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{a.name}</p>
                <p className="font-mono text-[12.5px] text-ink-2 [overflow-wrap:anywhere]">
                  {a.email}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                aria-label={`Copy email: ${a.name}`}
                onClick={() => void copy(a.email)}
              >
                <Copy aria-hidden className="size-4" />
                Copy email
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[14px]">
          <p className="font-medium">No active hospital admin</p>
          {invite && (
            <p className="text-[13px] text-ink-2">
              First admin {h.first_admin!.name}: {invite}
            </p>
          )}
          <Link href={`/hospitals/${h.id}`} className={openHospitalClass}>
            Open hospital
          </Link>
        </div>
      )}
    </section>
  );
}
