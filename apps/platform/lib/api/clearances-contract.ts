// Clearance letters and the named-access switch as the platform client sees
// them (spec §4 and §10, Plan 11b). A letter is a hospital's signed statement
// of who may see patient names, until when. Platform admins verify, reject and
// revoke letters, and run the switch; auditors read and view, but change
// nothing. Letter days (`letter_date`, `end_date`, `revocation.day`) are the
// hospital's calendar days (YYYY-MM-DD); every other time is a timestamp.
// The codes and their words come from `@mhai/ui/clearances`, which both apps
// share.
import type {
  ClearanceStatus,
  NamedPosition,
  RefusedReason,
  RejectReason,
  RevokeReason,
} from "@mhai/ui/clearances";
import type { Person, StepUp, TwoPersonRequest, WriteOpts } from "./contract";

export type {
  ClearanceStatus,
  NamedPosition,
  RefusedReason,
  RejectReason,
  RevokeReason,
};

export type ClearanceEvent = {
  at: string;
  kind:
    | "uploaded"
    | "refused"
    | "ready"
    | "verified"
    | "rejected"
    | "narrowed"
    | "revoked"
    | "ended"
    | "reminded";
  by: Person | null;
  side: "hospital" | "platform" | null;
  reason: string | null;
  note: string | null;
};

export type Clearance = {
  id: string;
  hospital: Person;
  status: ClearanceStatus;
  refused_reason: RefusedReason | null;
  signed_by: string;
  signer_title: string;
  letter_date: string;
  covered: Person[];
  /** Measured Health platform admins the letter names (Plan 12b). */
  covered_platform: Person[];
  /** The caller is in `covered_platform`: they can't verify or reject it. */
  covers_you: boolean;
  end_date: string;
  uploaded_by: Person;
  uploaded_at: string;
  ready_at: string | null;
  verified_by: Person | null;
  verified_at: string | null;
  rejection: {
    by: Person;
    at: string;
    reason: RejectReason;
    note: string | null;
  } | null;
  revocation: {
    by: Person;
    side: "hospital" | "platform";
    at: string;
    /** The hospital's day it was revoked, for "Revoked {date}". */
    day: string;
    reason: RevokeReason;
    note: string | null;
  } | null;
  pages: number;
  history: ClearanceEvent[];
  /**
   * The letter's hospital's day (YYYY-MM-DD), from the server: what its
   * status words and the Revoke cut-off count to. Per letter, as the list
   * spans time zones.
   */
  today: string;
  /** Decided by the server for the caller: false for auditors and linked admins. */
  verifiable_by_you: boolean;
  version: number;
};

export type ClearanceTab = "waiting" | "active" | "ending_soon" | "all";
export const CLEARANCE_TABS: readonly ClearanceTab[] = [
  "waiting",
  "active",
  "ending_soon",
  "all",
];

/** `covers: "me"` is "my clearances": the letters that name the caller (Plan 12b). */
export type ClearanceQuery = {
  status?: ClearanceTab;
  hospital?: string;
  covers?: "me";
  cursor?: string;
};

/** One sign-off: name and role, the day (YYYY-MM-DD), the document reference. */
export type Signoff = { by: string; at: string; ref: string };
export type Signoffs = { clinical: Signoff; privacy: Signoff; legal: Signoff };
export const SIGNOFF_KINDS: readonly (keyof Signoffs)[] = [
  "clinical",
  "privacy",
  "legal",
];

/** A raise lapses this many days after it was asked for (409 `expired`). */
export const SWITCH_LAPSE_DAYS = 7;

/**
 * A raise one platform admin asked for and a different one must approve,
 * with step-up, within 7 days (ruling 2). `reason` is the change in words:
 * the request has no free reason, the sign-offs are its grounds.
 */
export type SwitchRequest = TwoPersonRequest & {
  kind: "named_access";
  /** null: the global switch. */
  hospital: Person | null;
  position: NamedPosition;
  signoffs: Signoffs;
};

export type SwitchChange = {
  at: string;
  from: NamedPosition;
  to: NamedPosition;
  requested_by: Person | null;
  approved_by: Person | null;
  lowered_by: Person | null;
  reason: string | null;
  signoffs: Signoffs | null;
};

export type SwitchState = {
  position: NamedPosition;
  since: string | null;
  /** Newest first. */
  history: SwitchChange[];
  request: SwitchRequest | null;
  /**
   * The scope's version: every request, approval, cancel and lowering sends
   * the one it saw, and a clash is 409 `conflict`.
   */
  version: number;
};

export type HospitalSwitch = SwitchState & {
  hospital: Person;
  /** The lower of the global position and the hospital's own. */
  effective: NamedPosition;
};

export type NamedAccessOut = {
  global: SwitchState;
  hospitals: HospitalSwitch[];
  /**
   * Measured Health's day (YYYY-MM-DD), from the server: a sign-off may not
   * be dated after it. The browser does no time-zone arithmetic.
   */
  today: string;
};

export interface ClearancesClient {
  listClearances(
    q: ClearanceQuery,
  ): Promise<{ clearances: Clearance[]; next_cursor: string | null }>;
  getClearance(id: string): Promise<Clearance>;
  /** One server-drawn page image, never the file; never cached. */
  getClearancePage(id: string, n: number): Promise<Blob>;
  /**
   * 409 `same_person` when it covers the caller (checked first), `same_side`
   * when they can't verify it, `not_ready` while checking, `conflict` for
   * any other status or a stale version; an auditor gets 403.
   */
  verifyClearance(
    id: string,
    body: { version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<Clearance>;
  /** The same refusals as verify; Other needs a note (422). */
  rejectClearance(
    id: string,
    body: { reason: RejectReason; note?: string; version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<Clearance>;
  /**
   * A waiting or active letter only (409 `conflict`); Other needs a note.
   * Also 409 `same_person` when the letter covers the caller (checked first)
   * and `same_side` when the caller is linked to the hospital; both are
   * checked before the status and are not logged.
   */
  revokeClearance(
    id: string,
    body: { reason: RevokeReason; note?: string; version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<Clearance>;
  getNamedAccess(): Promise<NamedAccessOut>;
  /**
   * A raise, global (`hospital: null`) or for one hospital: 409
   * `signoff_missing` without all three sign-offs, `above_global` for a
   * hospital above the global position, `conflict` when one is already open
   * for that scope or the version is stale.
   */
  requestNamedAccess(
    body: {
      hospital: string | null;
      position: NamedPosition;
      signoffs: Signoffs;
      version: number;
    } & StepUp,
    opts: WriteOpts,
  ): Promise<NamedAccessOut>;
  /** A different admin only (409 `same_person`); 409 `expired` after the lapse. */
  approveNamedAccess(
    requestId: string,
    body: { version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<NamedAccessOut>;
  /** Any platform admin; no step-up. */
  cancelNamedAccess(
    requestId: string,
    body: { version: number },
    opts: WriteOpts,
  ): Promise<NamedAccessOut>;
  /** One admin, at once; it must lower (422 `invalid` otherwise). */
  lowerNamedAccess(
    body: {
      hospital: string | null;
      position: NamedPosition;
      reason: string;
      version: number;
    } & StepUp,
    opts: WriteOpts,
  ): Promise<NamedAccessOut>;
}
