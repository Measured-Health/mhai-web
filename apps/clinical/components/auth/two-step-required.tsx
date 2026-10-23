"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { ADMIN_KEYS, isMfaRequired } from "@/lib/admin-queries";
import { ANALYSIS_KEYS } from "@/lib/analysis-queries";
import { CLEARANCE_KEYS } from "@/lib/clearance-queries";
import { useAuth } from "@/lib/auth/auth-context";

const WATCHED = [ADMIN_KEYS.all, ANALYSIS_KEYS.all, CLEARANCE_KEYS.all];

/**
 * Every hospital admin, and everyone using Analysis, needs two-step
 * (amendment 3). When any admin, analysis or clearance-letter load or
 * change comes back "two-step not set up" (403 mfa_required), the person is
 * marked as without it, so the gates send them to the setup step. The
 * screens themselves never need to check for it.
 */
export function TwoStepRequired({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { updateUser } = useAuth();
  const needed = useEffectEvent(() => {
    // Nothing loaded without two-step is kept: after the setup, pages load afresh.
    qc.removeQueries({ queryKey: ADMIN_KEYS.all });
    qc.removeQueries({ queryKey: ANALYSIS_KEYS.all });
    qc.removeQueries({ queryKey: CLEARANCE_KEYS.all });
    updateUser({ mfaEnabled: false });
  });
  useEffect(() => {
    const queries = qc.getQueryCache();
    if (
      WATCHED.some((queryKey) =>
        queries.findAll({ queryKey }).some((q) => isMfaRequired(q.state.error)),
      )
    )
      needed();
    const offQueries = queries.subscribe((e) => {
      if (
        e.type === "updated" &&
        e.action.type === "error" &&
        WATCHED.some((k) => e.query.queryKey[0] === k[0]) &&
        isMfaRequired(e.action.error)
      )
        needed();
    });
    const offMutations = qc.getMutationCache().subscribe((e) => {
      if (
        e.type === "updated" &&
        e.action.type === "error" &&
        isMfaRequired(e.action.error)
      )
        needed();
    });
    return () => {
      offQueries();
      offMutations();
    };
  }, [qc]);
  return children;
}
