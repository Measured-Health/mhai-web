"use client";
import { Search, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStaff } from "@/lib/admin-queries";
import {
  STAFF_FILTERS,
  filterStaff,
  staffCounts,
  type StaffFilter,
} from "@/lib/admin/staff";
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
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const online = useOnline();
  const lastOpened = useRef<string | null>(null);

  // Held in memory only (never the URL); focus goes back to that person's row.
  useEffect(() => {
    if (openId) {
      lastOpened.current = openId;
    } else if (lastOpened.current) {
      const id = lastOpened.current;
      lastOpened.current = null;
      document
        .querySelector<HTMLElement>(`[data-staff-id="${CSS.escape(id)}"]`)
        ?.focus();
    }
  }, [openId]);

  const list = q.data ?? [];
  const counts = staffCounts(list, now);
  const rows = filterStaff(list, filter, search, now);
  const hospital = user?.hospital ?? "your hospital";
  const List = desktop ? StaffTable : StaffCards;

  return (
    <AdminFrame
      title="Staff"
      actions={
        <div className="flex flex-col items-end gap-1">
          <Button disabled={!online} onClick={() => setInviting(true)}>
            <UserPlus aria-hidden className="size-4" />
            Invite staff
          </Button>
          {!online && (
            <p className="text-[12px] text-ink-3">
              You&apos;re offline. Reconnect to invite people.
            </p>
          )}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <Search aria-hidden className="absolute left-3 size-4 text-ink-3" />
          <span className="sr-only">Search staff</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or specialty"
            className="min-h-11 w-full rounded-xl border border-lilac-2 bg-white pl-9 pr-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep"
          />
        </label>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
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

      {q.isPending ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : q.isError ? (
        <Banner tone="bad" title="Couldn't load the staff list">
          Check your connection and try again.
          <span className="mt-2 block">
            <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </span>
        </Banner>
      ) : rows.length === 0 ? (
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
      {q.isSuccess && (
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
