"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { useRedirect } from "@/lib/auth/use-redirect";
import { dropAnalysis, useAnalysisStatus } from "@/lib/queries/analysis";
import { TopBar } from "../shell/top-bar";
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
  // If it went down under the person's hands, focus moves to the reason.
  const shown = useRef(false);
  const reason = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!off) return;
    dropAnalysis(qc);
    if (shown.current) reason.current?.focus();
    shown.current = false;
  }, [off, qc]);
  useEffect(() => {
    if (status?.status === "ok" && !off) shown.current = true;
  }, [status, off]);

  let body;
  if (!admin || status === undefined) body = <Loading />;
  else if (off || status.status !== "ok")
    body = (
      <div className="rounded-2xl border border-dashed border-lilac-2 bg-white px-6 py-10 text-center">
        <h2
          ref={reason}
          tabIndex={-1}
          className="text-base font-semibold focus-visible:outline-none"
        >
          {NOT_AVAILABLE}
        </h2>
      </div>
    );
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
