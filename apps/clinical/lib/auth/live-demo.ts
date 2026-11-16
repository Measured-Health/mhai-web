/**
 * The public demo's seeded accounts in live mode (NEXT_PUBLIC_DEMO=true).
 * The backend's `core demo seed` (mhai-multiagent) makes them in the
 * synthetic demo hospital and resets them on every backend deploy.
 *
 * DEMO VALUES, PUBLISHED ON PURPOSE: the password and the authenticator
 * secret below are shown on the demo's sign-in page and in
 * deploy/README.md. They open only the synthetic demo hospital's accounts
 * and are not secrets. Never reuse them anywhere else.
 */
export const LIVE_DEMO_PASSWORD = "Sample-demo-only-2026";
export const LIVE_DEMO_TOTP_SECRET = "MHAIDEMOSAMPLEONLYNOTASECRET2345";
/** What the locked account's button fills: every try fails. */
export const LIVE_DEMO_WRONG_PASSWORD = "not-the-demo-password";

export type LiveDemoAccount = {
  email: string;
  label: string;
  note: string;
  password: string;
};

const account = (
  email: string,
  label: string,
  note: string,
  password = LIVE_DEMO_PASSWORD,
): LiveDemoAccount => ({ email, label, note, password });

/**
 * The seeded platform admin is not listed: its password and two-step secret
 * are random and never published (a platform role reaches every hospital),
 * so the live demo can't show the clinical app's refusal of it.
 */
export const LIVE_DEMO_ACCOUNTS: readonly LiveDemoAccount[] = [
  account("a.reyes@demo-hospital.example", "Clinician", "Signs straight in"),
  account(
    "mfa.okafor@demo-hospital.example",
    "Clinician with two-step",
    "Demo code shown on the next page",
  ),
  account(
    "new.bello@demo-hospital.example",
    "New account",
    "First sign-in steps",
  ),
  account(
    "newadmin.okoro@demo-hospital.example",
    "New hospital admin",
    "First sign-in steps",
  ),
  account(
    "admin.nwosu@demo-hospital.example",
    "Hospital admin",
    "Staff, settings and usage; no clinical screens",
  ),
  account(
    "director.obi@demo-hospital.example",
    "Medical director",
    "Clinician and hospital admin",
  ),
  account(
    "analyst.adeyemi@demo-hospital.example",
    "Analyst",
    "Clinician with Analysis",
  ),
  account(
    "locked.eze@demo-hospital.example",
    "Locked account",
    "Every try fails; the fifth locks it",
    LIVE_DEMO_WRONG_PASSWORD,
  ),
];
