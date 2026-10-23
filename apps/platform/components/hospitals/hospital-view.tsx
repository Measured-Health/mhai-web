"use client";
import Link from "next/link";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { useHospital } from "@/lib/queries/hospitals";
import { Banner } from "@mhai/ui/banner";
import { HospitalConnectionsSection } from "../emr/hospital-connections-section";
import { HospitalHoldsSection } from "../holds/hospital-holds-section";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { DetailsSection } from "./details-section";
import { FirstAdminSection } from "./first-admin-section";
import { DangerZone } from "./danger-zone";
import { RecentActions } from "./recent-actions";
import { RemovalPanel } from "./removal-panel";
import { SsoSection } from "./sso-section";
import { StatusSection } from "./status-section";

/**
 * One hospital: details, status, the first admin and recent actions.
 * Auditors see all of it and none of the actions.
 */
export function HospitalView({ id }: { id: string }) {
  const { user } = useAuth();
  const q = useHospital(id);
  const h = q.data;
  const gone = q.isError && platformError(q.error).gone;
  const canAct = isPlatformAdmin(user);
  const refetch = () => q.refetch();

  return (
    <>
      <TopBar
        title={gone ? "Hospital" : (h?.name ?? "Hospital")}
        sub={gone ? undefined : h?.short_code}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto flex max-w-[880px] flex-col gap-4">
          {gone ? (
            <Banner tone="warn" title="This was removed or no longer exists.">
              <Link
                href="/hospitals"
                className="mt-1 inline-flex min-h-11 items-center font-semibold underline sm:min-h-0"
              >
                Back to Hospitals
              </Link>
            </Banner>
          ) : q.isError && !h ? (
            <CouldntLoad what="this hospital" onRetry={() => void refetch()} />
          ) : !h ? (
            <Loading label="Loading hospital" />
          ) : (
            <>
              <StatusSection
                hospital={h}
                canAct={canAct}
                onGone={() => void refetch()}
              />
              <RemovalPanel hospital={h} />
              <HospitalHoldsSection
                hospital={h}
                onRetry={() => void refetch()}
              />
              <DetailsSection
                hospital={h}
                canEdit={canAct && h.status !== "removed"}
                onReload={refetch}
              />
              <FirstAdminSection
                hospital={h}
                canAct={canAct}
                onGone={() => void refetch()}
              />
              <SsoSection hospitalId={h.id} hospitalName={h.name} />
              <HospitalConnectionsSection hospital={h} />
              <RecentActions hospitalId={h.id} />
              <DangerZone hospital={h} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
