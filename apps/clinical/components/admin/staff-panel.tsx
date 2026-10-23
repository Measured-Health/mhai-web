"use client";
import { FileKey } from "lucide-react";
import { useId } from "react";
import type { HospitalSettingsOut, StaffOut } from "@/lib/api/admin-contract";
import {
  useHospitalSettings,
  useStaff,
  useStaffActivity,
} from "@/lib/admin-queries";
import { actorName, describeEvent } from "@/lib/admin/activity";
import { useAuth } from "@/lib/auth/auth-context";
import { canOpenNamedAccess } from "@/lib/auth/types";
import { useClearances, useNamedAccess } from "@/lib/clearance-queries";
import { safeDayLabel } from "@/lib/clearances/status";
import { namedAccessFor } from "@/lib/clearances/summary";
import { eventClock } from "@/lib/time";
import { adminError } from "@/lib/admin/errors";
import { inviteNote, policyBroken, sortName } from "@/lib/admin/staff";
import { useNow } from "@mhai/ui/hooks/use-now";
import { Avatar } from "../shell/account-menu";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { SidePanel } from "@mhai/ui/side-panel";
import { Skeleton } from "@mhai/ui/skeleton";
import { AccessEditor } from "./access-editor";
import { AccountActions, RemindButton } from "./account-actions";
import { StaffStatusChip } from "./chips";

const JOINED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function joined(s: StaffOut): string | null {
  const t = s.joined_at ? Date.parse(s.joined_at) : NaN;
  return Number.isFinite(t) ? `joined ${JOINED.format(t)}` : null;
}

/**
 * This person's named access (Plan 11), from the hospital's letters:
 * `undefined` while there is nothing to show (the switch isn't On, or the
 * letters haven't loaded), `null` for none, or the latest end date.
 */
function useNamedAccessOf(
  staffId: string,
): { until: string } | null | undefined {
  const { user } = useAuth();
  const allowed = canOpenNamedAccess(user);
  const position = useNamedAccess({ enabled: allowed });
  const on = allowed && position.data?.position === "on";
  const letters = useClearances({ enabled: on });
  if (!on || !letters.data) return undefined;
  return namedAccessFor(staffId, letters.data.clearances, letters.data.today);
}

function NamedAccessLine({ access }: { access: { until: string } | null }) {
  const until = access ? safeDayLabel(access.until) : null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-2">
      <FileKey aria-hidden className="size-4 shrink-0" />
      {until
        ? `Named access until ${until} · letter on file`
        : "No named access"}
    </p>
  );
}

/** The staff member side panel (hospital-admin.html tab 3). */
export function StaffPanel({
  staffId,
  onClose,
}: {
  staffId: string | null;
  onClose(): void;
}) {
  const staff = useStaff();
  const settings = useHospitalSettings();
  const now = useNow(60_000);
  const list = staff.data ?? [];
  const row = list.find((s) => s.id === staffId) ?? null;
  return (
    <SidePanel open={staffId !== null} onClose={onClose} title="Staff member">
      {row ? (
        <Member
          row={row}
          list={list}
          settings={settings.data}
          now={now}
          onClose={onClose}
        />
      ) : staff.isSuccess ? (
        <div role="status">
          <b className="block text-[15px]">
            This person is no longer on the staff list
          </b>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Someone else may have removed them. Nothing was changed.
          </p>
          <Button variant="ghost" className="mt-4" onClick={onClose}>
            Back to staff
          </Button>
        </div>
      ) : staff.isError ? (
        <Banner tone="bad" title={adminError(staff.error).title}>
          {adminError(staff.error).body}
          <span className="mt-2 block">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void staff.refetch()}
            >
              Try again
            </Button>
          </span>
        </Banner>
      ) : (
        <Skeleton className="h-40" />
      )}
    </SidePanel>
  );
}

function Member({
  row,
  list,
  settings,
  now,
  onClose,
}: {
  row: StaffOut;
  list: StaffOut[];
  settings: HospitalSettingsOut | undefined;
  now: number;
  onClose(): void;
}) {
  const activity = useStaffActivity(row.id);
  const recentId = useId();
  const note = inviteNote(row, now);
  const named = useNamedAccessOf(row.id);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start gap-3">
        <Avatar name={sortName(row.full_name)} className="size-11 text-sm" />
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <b className="block text-[16px]">{row.full_name}</b>
          {row.is_you && <span className="text-[13px] text-ink-3">(you)</span>}
          <small className="block text-[12.5px] text-ink-3">
            {[row.email, joined(row)].filter(Boolean).join(" · ")}
          </small>
          <div className="mt-2">
            <StaffStatusChip staff={row} now={now} />
          </div>
          {named !== undefined && <NamedAccessLine access={named} />}
        </div>
      </header>

      {policyBroken(row, settings?.require_mfa_for_clinicians ?? true) && (
        <Banner tone="warn" title="Two-step verification isn't set up">
          Hospital policy requires it. {row.display_name} will be asked at next
          sign-in.
          <RemindButton row={row} />
        </Banner>
      )}
      {note && <p className="text-[13px] text-ink-2">{note}</p>}

      {settings ? (
        <AccessEditor
          key={row.id}
          row={row}
          list={list}
          specialties={settings.specialties}
          named={!!named}
        />
      ) : (
        <Skeleton className="h-48" />
      )}

      <AccountActions
        row={row}
        list={list}
        onRemoved={onClose}
        named={!!named}
      />

      <section aria-labelledby={recentId}>
        <h3 id={recentId} className="mb-2 text-[13px] font-semibold">
          Recent activity
        </h3>
        {activity.isPending ? (
          <Skeleton className="h-16" />
        ) : activity.isError ? (
          <p className="text-[13px] text-ink-3">
            Couldn&apos;t load recent activity.
          </p>
        ) : activity.data.length ? (
          <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
            {activity.data.map((e) => (
              <li key={e.id} className="[overflow-wrap:anywhere]">
                <span className="font-mono text-[11.5px] text-ink-3">
                  {eventClock(e.at, now)}
                </span>{" "}
                · {describeEvent(e)}
                {e.actor ? ` · by ${actorName(e)}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">Nothing recorded yet.</p>
        )}
      </section>
      <p className="text-[12px] text-ink-3">
        Every change is recorded in the activity log.
      </p>
    </div>
  );
}
