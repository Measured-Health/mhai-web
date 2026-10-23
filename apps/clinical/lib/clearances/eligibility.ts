import type { StaffOut } from "../api/admin-contract";

export type Eligibility =
  | { ok: true }
  | {
      ok: false;
      reason:
        "Not an analyst or hospital admin" | "Two-step isn't on" | "Not active";
    };

/**
 * Who a letter can cover: active staff who hold hospital admin or Analyst and
 * have two-step on. The server has the last word (422 `not_eligible`).
 */
export function eligibility(s: StaffOut): Eligibility {
  if (s.status !== "active") return { ok: false, reason: "Not active" };
  if (!s.roles.some((r) => r === "hospital_admin" || r === "analyst"))
    return { ok: false, reason: "Not an analyst or hospital admin" };
  if (s.issues.includes("mfa_not_set_up"))
    return { ok: false, reason: "Two-step isn't on" };
  return { ok: true };
}
