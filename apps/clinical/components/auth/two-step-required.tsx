"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { ADMIN_KEYS, isMfaRequired } from "@/lib/admin-queries";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Every hospital admin needs two-step (amendment 3). When any admin load or
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
    updateUser({ mfaEnabled: false });
  });
  useEffect(() => {
    const queries = qc.getQueryCache();
    if (
      queries
        .findAll({ queryKey: ADMIN_KEYS.all })
        .some((q) => isMfaRequired(q.state.error))
    )
      needed();
    const offQueries = queries.subscribe((e) => {
      if (
        e.type === "updated" &&
        e.action.type === "error" &&
        e.query.queryKey[0] === ADMIN_KEYS.all[0] &&
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
