"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { useRedirect } from "@/lib/auth/use-redirect";
import { dropAnalysis, useAnalysisStatus } from "@/lib/queries/analysis";
import { TopBar } from "../shell/top-bar";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { AnalysisView } from "./analysis-view";

export const NOT_AVAILABLE = "Analysis isn't available yet";
/** Where an auditor goes instead: the trail of who used Analysis. */
export const AUDITOR_HOME = "/activity?tab=analysis-access";

/**
 * Platform admins only, and only while the server's status says the page
 * is on. An auditor goes to the access trail. A status that fails, says
 * off, or a 403 `analysis_off` from any analysis call shows only "Analysis
 * isn't available yet".
 */
export function AnalysisGate() {
  const { user } = useAuth();
  const admin = isPlatformAdmin(user);
  useRedirect(admin ? null : AUDITOR_HOME);
  const status = useAnalysisStatus(admin);
  const qc = useQueryClient();
  const off =
    status?.status === "failed" ||
    (status?.status === "ok" && !status.data.aggregates_enabled);
  // Once the page is down (its queries unmounted), nothing it read stays.
  useEffect(() => {
    if (off) dropAnalysis(qc);
  }, [off, qc]);

  let body;
  if (!admin || status === undefined) body = <Loading />;
  else if (off || status.status !== "ok")
    body = <Empty title={NOT_AVAILABLE} />;
  else body = <AnalysisView status={status.data} />;

  return (
    <>
      <TopBar title="Analysis" />
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-10 pt-5 md:px-[26px] md:pt-6">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4">{body}</div>
      </div>
    </>
  );
}
