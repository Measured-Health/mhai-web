"use client";
import { Search, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StaffOut } from "@/lib/api/admin-contract";
import { ADMIN_KEYS, useStaff } from "@/lib/admin-queries";
import {
  STAFF_FILTERS,
  filterStaff,
  staffCounts,
  type StaffFilter,
} from "@/lib/admin/staff";
import { adminError } from "@/lib/admin/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { useNow } from "@/lib/hooks/use-now";
import { useOnline } from "@/lib/hooks/use-online";
import { FilterChip } from "../corrections/filter-chip";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { AdminFrame } from "./admin-frame";
import { InviteDialog } from "./invite-dialog";
import { StaffPanel } from "./staff-panel";
import { StaffCards, StaffTable } from "./staff-list";

/** The hospital admin's home (hospital-admin.html tab 1). */
export function StaffView() {
  const q = useStaff();
  const qc = useQueryClient();
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const online = useOnline();
  const lastOpened = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Held in memory only (never the URL); focus goes back to that person's
  // row, or to the search field when the row is gone (removed).
  useEffect(() => {
    if (openId) {
      lastOpened.current = openId;
    } else if (lastOpened.current) {
      const id = lastOpened.current;
      lastOpened.current = null;
      // The cache is already up to date, even if the list hasn't re-rendered.
      const here = qc
        .getQueryData<StaffOut[]>(ADMIN_KEYS.staff)
        ?.some((s) => s.id === id);
      const row = here
        ? document.querySelector<HTMLElement>(
            `[data-staff-id="${CSS.escape(id)}"]`,
          )
        : null;
      (row ?? searchRef.current)?.focus();
    }
  }, [openId, qc]);

  const list = q.data ?? [];
  const counts = staffCounts(list, now);
  const rows = filterStaff(list, filter, search, now);
  const hospital = user?.hospital ?? "your hospital";
  const failed = q.isError ? adminError(q.error) : null;
  const waiting = q.isPending && !q.isError && q.fetchStatus === "paused";
  const showControls = !(q.isError && !q.data);
  const List = desktop ? StaffTable : StaffCards;

  return (
    <AdminFrame
      title="Staff"
      actions={
        <div className="flex flex-col items-end gap-1">
          <Button
            disabled={!online}
            aria-describedby={online ? undefined : "invite-offline"}
            onClick={() => setInviting(true)}
          >
            <UserPlus aria-hidden className="size-4" />
            Invite staff
          </Button>
          {!online && (
            <p id="invite-offline" className="text-[12px] text-ink-3">
              You&apos;re offline. Reconnect to invite people.
            </p>
          )}
        </div>
      }
    >
      {showControls && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[220px] flex-1 items-center">
            <Search aria-hidden className="absolute left-3 size-4 text-ink-3" />
            <span className="sr-only">Search staff</span>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or specialty"
              className="min-h-11 w-full rounded-xl border border-lilac-2 bg-white pl-9 pr-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep"
            />
          </label>
          <div
            role="group"
            aria-label="Show"
            className="flex flex-wrap gap-1.5"
          >
            {STAFF_FILTERS.filter(
              (f) => f.id === "all" || f.id === filter || counts[f.id] > 0,
            ).map((f) => (
              <FilterChip
                key={f.id}
                pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label} · {counts[f.id]}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {failed && (
        <div className="mb-4">
          <Banner tone="bad" title={failed.title}>
            {failed.body}
            <span className="mt-2 block">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </span>
          </Banner>
        </div>
      )}
      {waiting ? (
        <div
          role="status"
          className="card-v3 p-6 text-center text-[14px] text-ink-2"
        >
          You&apos;re offline. Staff will load when you reconnect.
        </div>
      ) : q.isPending ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !q.data ? null : rows.length === 0 ? (
        <div className="card-v3 p-6 text-center text-[14px] text-ink-2">
          {search ? (
            <>
              <p>No one matches &quot;{search}&quot;.</p>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => setSearch("")}
              >
                Clear search
              </Button>
            </>
          ) : (
            <p>No one here yet.</p>
          )}
        </div>
      ) : (
        <List rows={rows} now={now} onOpen={setOpenId} />
      )}
      {q.data && (
        <p role="status" className="sr-only">
          {rows.length === 1 ? "1 person shown" : `${rows.length} people shown`}
        </p>
      )}

      <p className="mt-4 text-[12.5px] text-ink-3">
        Hospital admins manage people and settings for {hospital} only. They
        never see patients&apos; consultations unless they&apos;re also a
        clinician.
      </p>

      <StaffPanel staffId={openId} onClose={() => setOpenId(null)} />
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </AdminFrame>
  );
}
