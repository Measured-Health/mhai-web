"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Hospital } from "@/lib/api/contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { HOLD_STATUSES } from "@/lib/api/holds-contract";
import { holdStatusLabel } from "@/lib/holds/labels";
import { scopeLabel } from "@/lib/holds/rules";
import { Button } from "@mhai/ui/button";
import { Section } from "../hospitals/section";
import { CouldntLoad } from "../states/couldnt-load";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { PlaceHoldDialog } from "./place-hold-dialog";

/** Place a hold: a button when online, disabled and saying why when not. */
function PlaceButton({ onClick }: { onClick(): void }) {
  const net = useNeedsConnection("hospital-place-offline");
  return (
    <>
      <Button size="sm" onClick={onClick} {...net.props}>
        <Plus aria-hidden className="size-4" />
        Place a hold
      </Button>
      {net.offline && <OfflineNote id="hospital-place-offline" />}
    </>
  );
}

/**
 * The holds that keep this hospital's records (spec §4), each linked to its
 * page. Platform admins can place one here, unless the hospital is Removed.
 */
export function HospitalHoldsSection({
  hospital: h,
  onRetry,
}: {
  hospital: Hospital;
  onRetry(): void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [placing, setPlacing] = useState(false);
  const canPlace = isPlatformAdmin(user) && h.status !== "removed";
  // A status this app has no words for fails this block, never the page.
  const known = h.legal_holds.every((x) => HOLD_STATUSES.includes(x.status));
  return (
    <Section
      title="Legal holds"
      action={
        canPlace ? <PlaceButton onClick={() => setPlacing(true)} /> : null
      }
    >
      {!known ? (
        <CouldntLoad what="legal holds" onRetry={onRetry} />
      ) : h.legal_holds.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">No legal holds</p>
      ) : (
        <ul className="divide-y divide-line">
          {h.legal_holds.map((x) => (
            <li key={x.id}>
              <Link
                href={`/legal-holds/${x.id}`}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep"
              >
                <span className="font-mono font-semibold text-bloom [overflow-wrap:anywhere]">
                  {x.reference}
                </span>
                <span className="text-ink-2">{scopeLabel(x.scope)}</span>
                <span className="font-semibold">
                  {holdStatusLabel(x.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canPlace && (
        <PlaceHoldDialog
          open={placing}
          hospital={{ id: h.id, name: h.name }}
          onClose={() => setPlacing(false)}
          onPlaced={(hold) => router.push(`/legal-holds/${hold.id}`)}
        />
      )}
    </Section>
  );
}
