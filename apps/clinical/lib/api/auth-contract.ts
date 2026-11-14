// Hand-written from the backend spec plus this plan's assumed contract.
// To be replaced by types generated from the backend OpenAPI schema.

/** The user as the MHAI API returns it. Optional fields arrive with backend §10 work. */
export interface ApiUser {
  /** Older shape; core (contract v1.2.0) sends `id` and no username. */
  username?: string;
  id?: string;
  role: string;
  /** Every role (assumed, spec §10 item 2); `role` stays the primary one. */
  roles?: string[];
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  role_title?: string | null;
  specialty?: string | null;
  /** `{id, name}` from core (contract v1.2.0); a name in older shapes. */
  hospital?: string | { id: string; name: string } | null;
  mfa_enabled?: boolean;
  must_change_password?: boolean;
  terms_accepted_at?: string | null;
  recovery_codes_left?: number | null;
  /**
   * Switches the API turned on for this person (assumed). `named_access`
   * (Plan 11) counts only with Analysis on and the named sign-off key set.
   */
  features?: { analysis?: boolean; named_access?: boolean };
}
export interface ApiLoginOk {
  access_token: string;
  expires_in: number;
  /** For the BFF only: sealed in the session cookie, never sent to the page. */
  refresh_token?: string;
  user: ApiUser;
}
export interface ApiMfaRequired {
  mfa_required: true;
  mfa_token: string;
  /**
   * false: two-step isn't set up yet, so the challenge with an empty code
   * gives the enrolment-only session. Anything else: ask for the code.
   */
  mfa_enrolled?: boolean;
}
export interface ApiDeviceToken {
  device_token?: string;
}
