"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Hospital } from "@/lib/api/contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { syncLine } from "@/lib/emr/labels";
import { connectionState } from "@/lib/emr/state";
import { useConnectionList } from "@/lib/queries/connection-list";
import { Section } from "../hospitals/section";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { ConnectionChip } from "./connection-chip";
import { addHref } from "./connections-table";

/**
 * The patient record connections of one hospital (spec §5), each linked to
 * its page. Platform admins can add one, unless the hospital is Removed.
 */
export function HospitalConnectionsSection({
  hospital: h,
}: {
  hospital: Hospital;
}) {
  const { user } = useAuth();
  const q = useConnectionList(h.id);
  const [now] = useState(() => Date.now());
  const canAdd = isPlatformAdmin(user) && h.status !== "removed";
  const rows = q.data?.connections ?? [];
  const add = canAdd && q.data && (
    <Link
      href={addHref(h.id)}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line px-4 text-[13px] font-semibold text-bloom focus-visible:outline-2 focus-visible:outline-mint-deep sm:min-h-9"
    >
      <Plus aria-hidden className="size-4" />
      Add a connection
    </Link>
  );
  return (
    <Section title="Patient record connections" action={add || null}>
      {q.isError && !q.data ? (
        <CouldntLoad
          what="patient record connections"
          onRetry={() => void q.refetch()}
        />
      ) : !q.data ? (
        <Loading label="Loading patient record connections" />
      ) : rows.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">
          Not connected. MHAI can&apos;t raise patient alerts for this hospital
          yet.
        </p>
      ) : (
        <ul
          aria-label="Patient record connections"
          className="divide-y divide-line"
        >
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/connections/${c.id}`}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep"
              >
                <span className="font-semibold text-bloom [overflow-wrap:anywhere]">
                  {c.source_label}
                </span>
                <span className="text-ink-2">{c.type_label}</span>
                <ConnectionChip state={connectionState(c)} />
                <span className="text-ink-3">{syncLine(c, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
