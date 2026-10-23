// The clearance-letter API (Plan 11, spec §10), hand-written from the assumed
// contract. To be replaced by types generated from the backend OpenAPI schema.
// A letter is only ever seen as server-made page images; its original never
// reaches the browser.

import type {
  ClearanceStatus,
  NamedPosition,
  NarrowReason,
  RefusedReason,
  RejectReason,
  RevokeReason,
} from "@mhai/ui/clearances";
import type { StaffRemoveAuth } from "./admin-contract";

/** The admin's own two-step code, as the admin client takes it. */
export type StepUp = StaffRemoveAuth;

export type Who = { display_name: string };
export type CoveredOut = { id: string; display_name: string };

export type ClearanceEventKind =
  | "uploaded"
  | "refused"
  | "ready"
  | "verified"
  | "rejected"
  | "narrowed"
  | "revoked"
  | "ended"
  | "reminded";

export type ClearanceEventOut = {
  at: string;
  kind: ClearanceEventKind;
  by: Who | null;
  side: "hospital" | "platform" | null;
  reason: string | null;
  note: string | null;
  removed?: CoveredOut[];
};

export type ClearanceOut = {
  id: string;
  status: ClearanceStatus;
  refused_reason: RefusedReason | null;
  signed_by: string;
  signer_title: string;
  letter_date: string; // YYYY-MM-DD
  covered: CoveredOut[];
  /** Measured Health staff the letter names (Plan 12b). */
  covered_platform: CoveredOut[];
  /** The hospital's day. */
  end_date: string;
  uploaded_by: Who;
  uploaded_at: string;
  verified_by: Who | null;
  verified_at: string | null;
  rejection: { reason: RejectReason; note: string | null; at: string } | null;
  revocation: {
    by: Who;
    side: "hospital" | "platform";
    at: string;
    /** `at` as the hospital's day (YYYY-MM-DD). */
    day: string;
    reason: RevokeReason;
    note: string | null;
  } | null;
  renews: string | null;
  /** 0 until ready. */
  pages: number;
  history: ClearanceEventOut[];
  version: number;
};

export type ClearancesOut = {
  clearances: ClearanceOut[];
  /** The hospital's day, as the server sees it. */
  today: string;
  max_end_date: string;
};

export type ClearanceUpload = {
  file: File;
  signed_by: string;
  signer_title: string;
  letter_date: string;
  covered: string[];
  /** Emails, as written in the letter. */
  covered_platform?: string[];
  end_date: string;
  renews?: string;
} & StepUp;

/** The effective position for this hospital. */
export type NamedAccessOut = { position: NamedPosition; since: string | null };

export type RevokeBody = {
  reason: RevokeReason;
  note?: string;
} & StepUp;

export type NarrowBody = {
  remove: string[];
  reason: NarrowReason;
  note?: string;
  version: number;
} & StepUp;
