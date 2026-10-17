// Hand-written from the backend spec plus this plan's assumed contract.
// To be replaced by types generated from the backend OpenAPI schema.

/** The user as the MHAI API returns it. Optional fields arrive with backend §10 work. */
export interface ApiUser {
  username: string;
  role: string;
  /** Every role (assumed, spec §10 item 2); `role` stays the primary one. */
  roles?: string[];
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  role_title?: string | null;
  specialty?: string | null;
  hospital?: string | null;
  mfa_enabled?: boolean;
  must_change_password?: boolean;
  terms_accepted_at?: string | null;
  recovery_codes_left?: number | null;
}
export interface ApiLoginOk {
  access_token: string;
  expires_in: number;
  user: ApiUser;
}
export interface ApiMfaRequired {
  mfa_required: true;
  mfa_token: string;
}
export interface ApiSession {
  id: string;
  device: string;
  location?: string | null;
  last_seen_at: string; // ISO 8601
  current: boolean;
}
export interface ApiDeviceToken {
  device_token?: string;
}
