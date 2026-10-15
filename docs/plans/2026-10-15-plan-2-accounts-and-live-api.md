# Plan 2: Sign-in, accounts and the live API (design v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put sign-in, first sign-in, password reset, the account page and
the 403 "wrong app" page in front of the Plan 1 clinical flow, mock first.
Add the server-side session (BFF) and the live API adapters, written
against the backend's approved API design, so the app can switch to the
real API without UI changes.

**Architecture:**

- UI reads auth through a typed `AuthClient`, the same pattern as Plan 1's
  `MhaiClient`. There are two implementations:
  - `createMockAuthClient()` (memory only, used when
    `NEXT_PUBLIC_USE_MOCK=true`);
  - `createLiveAuthClient()`, which calls this app's own route handlers
    under `/api/auth/*`.
- Those route handlers (the BFF) call the MHAI API, keep its token in a
  sealed `httpOnly` cookie, and proxy clinical calls through
  `/api/v1/*`. Browser JavaScript never sees a token.
- An `AuthProvider` holds the signed-in user in memory. An `AuthGate` keeps
  every clinical screen behind sign-in, first sign-in and the clinician
  role.
- A `Capabilities` object says what the current backend supports, and the
  UI hides the rest. So the mock shows the whole design, and the live app
  shows only what the API can do.

**Tech Stack:** as Plan 1, plus:

- `qrcode` for the two-step setup QR code;
- Node's built-in `crypto` (AES-256-GCM) for the session cookie.

No other new dependencies.

**Spec:** `docs/specs/2026-10-13-ui-design-v3.md`. Read §5.5 Account, §10
items 4–8 and §11. Also read:

- `ARCHITECTURE.md` §4.2 (Inside the app) and §4.3 (Signing in);
- the design boards `design/v3/account.html`,
  `design/v3/account-flows.html` and `design/v3/states-and-export.html`
  (the 403 card).

The backend contract is the approved design
`mhai-multiagent/docs/specs/2026-10-08-api-gateway-phase1-design.md` §4.
The backend API is **not built yet**, so the live half is written and
tested against that design, using a fake upstream.

**Not in this plan:**

- **Types generated from OpenAPI.** The backend has no committed
  `openapi.json` yet (its spec §4 plans `mhai openapi export`), so
  `lib/api/contract.ts` stays hand-written. A follow-up swaps it for
  `openapi-typescript` output once the file exists.
- **Live features the backend design doesn't include yet** (spec §10).
  The capabilities flags hide them, and the mock shows them:
  - hospital single sign-on (backend Plan 3);
  - email as the login name;
  - password reset by email;
  - devices and "sign out everywhere";
  - "trust this device";
  - a server record of accepted terms;
  - viewing or regenerating backup codes.
- **Plan 3:** My feedback & corrections (including the account page's
  feedback stats) and the review queue.
- **Plan 4:** the hospital admin app.

**Mock first:** the demo keeps running on mock data, with the sign-in
screens in front. A hint on the sign-in page tells testers how to reach
each state:

- any email and password signs in;
- two-step code `123456`;
- emails starting `mfa`, `new`, `admin` or `locked`;
- the password `wrong`.

## Global Constraints

- **Read the Next.js docs before coding.** This Next.js version has
  breaking changes. Before writing code for a feature, read the matching
  guide in `node_modules/next/dist/docs/` (AGENTS.md). Notes:
  - Route handlers use `RouteContext<'/path/[param]'>`, and their params
    are a Promise.
  - `cookies()` from `next/headers` is async.
  - The middleware file is `proxy.ts`.
  - With `cacheComponents`, `useSearchParams` and `use(params)` must sit
    inside `<Suspense>`.
- **Node and installs:** Node 24 (`.nvmrc`). Install with
  `npm install -E` and commit `package-lock.json`.
- **Plan 1 rules still apply.** In particular: the wording rules, no
  patient data in browser storage or `console.*`, touch targets ≥44 px,
  dialogs trap focus and close on Esc, motion tokens only, and all motion
  is off under reduced motion.
- **Tokens never reach browser JavaScript:**
  - The API token lives only in the sealed `mhai_session` cookie
    (`httpOnly`, `SameSite=Strict`, `Path=/`, `Secure` in production).
  - The MFA step token lives only in the sealed `mhai_mfa` cookie (same
    flags, 5 minutes).
  - Seal both with AES-256-GCM, keyed from `SESSION_SECRET`, which must be
    ≥32 characters. Live mode refuses to start a session without it.
- **Nothing about the account goes in browser storage:** no passwords,
  codes, backup codes, emails or user objects in `localStorage`,
  `sessionStorage`, IndexedDB or the URL. Reset tokens arrive in the URL
  from the email; strip them from the address bar as soon as they're
  read.
- **Generic sign-in errors:** never reveal whether an account or email
  exists. The forgot-password reply is the same either way.
- **Show only what the backend supports:** read `capabilities` and hide
  the rest. Never show an attempt count, device or date that the API
  didn't give.
- **Never send a user or clinician id from the client.** The BFF adds the
  token, and the API knows who you are.
- **Same-origin writes:** every BFF `POST` checks that `Origin` matches
  `Host`, and otherwise returns 403 `{code:"forbidden"}`.
- **BFF responses** send `Cache-Control: no-store`, and never echo
  upstream error text. The body is `{code}` only.
- **Clinical app is for clinicians.** Any other role (`admin`, `auditor`,
  `researcher`, or anything unknown) sees the 403 page, never a clinical
  screen.
- **Commits:** imperative subject ≤72 characters, and **no AI
  attribution**. Work on branch `agent/plan-2-accounts`; humans merge.

## Review Focus

1. **The API token expires or is revoked mid-consultation (any 401 from
   `/api/v1/*`).** Expected: one sign-out with "Your session ended", the
   session history and cache cleared, and a single redirect to sign-in,
   with no loop and no retry storm. Tested in Task 12.
2. **A messy two-step code is pasted or typed:**
   - with spaces or a dash (`123 456`, `123-456`);
   - seven digits;
   - letters.

   Expected: only the first six digits are used, and Verify stays
   disabled until there are six. Tested in Task 5.

3. **Reloading or deep-linking `/sign-in/code` or `/welcome` with nothing
   pending.** Expected: redirect to `/sign-in` (or `/` if already fully
   signed in), with no crash and no blank page. Tested in Tasks 5 and 6.
4. **An admin, auditor or researcher account signs in.** Expected: the
   403 page, no clinical screen mounted, no clinical API call, and Sign
   out available. Tested in Tasks 3 and 8.
5. **The API is down or times out during sign-in.** Expected: "We can't
   reach MHAI right now", never "wrong password", and the attempt counter
   untouched. Tested in Tasks 4 and 11.

---

## File structure

```text
lib/auth/
  types.ts                 User, Role, Capabilities, AuthClient, AuthError, initials()
  mock.ts                  createMockAuthClient(): memory-only, trigger-driven demo states
  live.ts                  createLiveAuthClient(): calls /api/auth/* (Task 12)
  client.ts                getAuthClient(): mock or live
  events.ts                onUnauthorized / reportUnauthorized
  password-rules.ts        passwordRules(), passwordError(), COMMON_PASSWORDS
  auth-context.tsx         AuthProvider, useAuth, isClinical
lib/api/
  live.ts                  createLiveClient(): MhaiClient over /api/v1 (Task 12)
  errors.ts                ApiError
lib/server/
  session.ts               seal/unseal, cookie names and options, read/write session
  api.ts                   api(): MHAI API fetch with timeout + problem+json → UpstreamError
  map-user.ts              toUser(), stepsFor()
  http.ts                  json(), sameOrigin(), authErrorResponse()
app/(auth)/
  layout.tsx               AuthLayout (brand panel + card)
  sign-in/page.tsx         sign-in
  sign-in/code/page.tsx    two-step code
  welcome/page.tsx         first sign-in: terms → password → 2-step → backup codes
  forgot-password/page.tsx request a reset link → "check your email"
  reset-password/page.tsx  new password → "password updated"
app/no-access/page.tsx     403 "wrong app"
app/ended/                 moved from app/(clinical)/ended (outside the gate)
app/(clinical)/account/page.tsx   profile & security
app/api/auth/{login,mfa,session,logout,password,terms}/route.ts
app/api/auth/mfa/setup/route.ts, app/api/auth/mfa/setup/confirm/route.ts
app/api/v1/[...path]/route.ts     clinical API proxy
components/auth/           AuthLayout, GuestGate, AuthGate, SignInForm, DemoHint,
                           CodeInput, CodeForm, PasswordFields, WelcomeFlow, TermsStep,
                           NewPasswordStep, MfaSetup, QrCode, BackupCodes,
                           ForgotPassword, ResetPassword, NoAccess
components/account/        AccountView, ChangePasswordDialog, DevicesSection
components/shell/account-menu.tsx
tests/auth-wrapper.tsx     TEST_USER, withAuth() for component tests
tests/e2e/account.spec.ts
```

### Task 1: Auth types and the mock auth client

**Files:**

- Create: `lib/auth/types.ts`, `lib/auth/mock.ts`, `lib/auth/client.ts`, `lib/auth/mock.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - **Types:** `Role`, `User`, `FirstStep`, `Session` (`{ user: User;
steps: FirstStep[] }`), `SignInResult`, `Capabilities`,
    `AuthErrorCode`, `class AuthError`, `Device`, `MfaSetup`, `interface
AuthClient`. `getSession()` resolves to `Session | null`.
  - **Helpers:** `initials(name: string): string` and
    `isClinical(user: User | null): boolean`.
  - **Mock:** `createMockAuthClient(opts?: { now?: () => number }):
AuthClient`, plus the constants `MOCK_CODE`, `MOCK_RESET_TOKEN` and
    `MOCK_BACKUP_CODES`.
  - **Client:** `getAuthClient(): AuthClient`.

**Mock rules.** The trigger is the first word of the login before `@`,
split on `.`, `_`, `+` or `-`:

| Input                             | Result                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| password `wrong`                  | `invalid_credentials`, counting down `attemptsLeft` from 4. The 5th try locks the login for 15 minutes (`locked`). |
| trigger `locked`                  | `locked`                                                                                                           |
| trigger `mfa`                     | `mfa_required`. Then code `123456`, or one of the backup codes once each.                                          |
| trigger `new`                     | signed in with `steps: ["terms", "password", "mfa"]` and `mfaEnabled: false`                                       |
| trigger `admin` or `auditor`      | signed in with that role (the 403 path)                                                                            |
| anything else                     | a signed-in clinician with two-step on                                                                             |
| reset token `demo`                | accepted; any other token gives `link_expired`                                                                     |
| new passwords under 12 characters | `weak_password`                                                                                                    |

- [ ] **Step 1: Write the failing test**

`lib/auth/mock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AuthError, initials, isClinical } from "./types";
import {
  MOCK_BACKUP_CODES,
  MOCK_CODE,
  MOCK_RESET_TOKEN,
  createMockAuthClient,
} from "./mock";

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AuthError;
  }
  throw new Error("expected a rejection");
};

describe("mock auth client", () => {
  it("signs a normal clinician straight in", async () => {
    const c = createMockAuthClient();
    const r = await c.signIn("a.reyes@havanahospital.org", "anything");
    expect(r).toMatchObject({ status: "signed_in", steps: [] });
    if (r.status !== "signed_in") throw new Error();
    expect(r.user).toMatchObject({
      email: "a.reyes@havanahospital.org",
      role: "clinician",
      displayName: "Dr. Reyes",
      mfaEnabled: true,
    });
    expect(await c.getSession()).toEqual({ user: r.user, steps: [] });
  });

  it("counts down wrong passwords, then locks for 15 minutes", async () => {
    let t = 0;
    const c = createMockAuthClient({ now: () => t });
    const e1 = await fail(c.signIn("x@h.org", "wrong"));
    expect(e1).toMatchObject({ code: "invalid_credentials", attemptsLeft: 4 });
    for (let i = 0; i < 3; i++) await fail(c.signIn("x@h.org", "wrong"));
    expect(await fail(c.signIn("x@h.org", "wrong"))).toMatchObject({
      code: "locked",
    });
    expect(await fail(c.signIn("x@h.org", "right"))).toMatchObject({
      code: "locked",
    });
    t = 15 * 60_000 + 1;
    expect((await c.signIn("x@h.org", "right")).status).toBe("signed_in");
  });

  it("asks for a two-step code, and accepts 123456 or a backup code once", async () => {
    const c = createMockAuthClient();
    expect(await c.signIn("mfa@h.org", "pw")).toEqual({
      status: "mfa_required",
    });
    expect(
      await fail(c.verifyCode("000000", { backup: false, trustDevice: false })),
    ).toMatchObject({ code: "mfa_invalid" });
    const r = await c.verifyCode(MOCK_CODE, {
      backup: false,
      trustDevice: true,
    });
    expect(r.status).toBe("signed_in");

    await c.signOut();
    await c.signIn("mfa@h.org", "pw");
    const code = MOCK_BACKUP_CODES[0]!.toLowerCase().replace("-", " ");
    expect(
      (await c.verifyCode(code, { backup: true, trustDevice: false })).status,
    ).toBe("signed_in");
    await c.signOut();
    await c.signIn("mfa@h.org", "pw");
    expect(
      await fail(
        c.verifyCode(MOCK_BACKUP_CODES[0]!, {
          backup: true,
          trustDevice: false,
        }),
      ),
    ).toMatchObject({ code: "mfa_invalid" });
  });

  it("says the code step expired when nothing is pending", async () => {
    const c = createMockAuthClient();
    expect(
      await fail(
        c.verifyCode(MOCK_CODE, { backup: false, trustDevice: false }),
      ),
    ).toMatchObject({ code: "mfa_expired" });
  });

  it("gives a new account its first sign-in steps", async () => {
    const c = createMockAuthClient();
    const r = await c.signIn("new.nurse@h.org", "temp");
    expect(r).toMatchObject({
      status: "signed_in",
      steps: ["terms", "password", "mfa"],
      user: { mfaEnabled: false },
    });
    await c.acceptTerms();
    await c.changePassword(null, "a-long-enough-password");
    expect((await c.getSession())?.steps).toEqual(["mfa"]);
    const setup = await c.startMfaSetup();
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/MHAI:/);
    expect(setup.backupCodes).toHaveLength(10);
    await expect(c.confirmMfaSetup("111111")).rejects.toMatchObject({
      code: "mfa_invalid",
    });
    await c.confirmMfaSetup(MOCK_CODE);
    expect(await c.getSession()).toMatchObject({
      user: { mfaEnabled: true },
      steps: [],
    });
  });

  it("signs admin and auditor accounts in with their role", async () => {
    const c = createMockAuthClient();
    const r = await c.signIn("admin@h.org", "pw");
    if (r.status !== "signed_in") throw new Error();
    expect(r.user.role).toBe("admin");
    expect(isClinical(r.user)).toBe(false);
  });

  it("checks passwords and reset links", async () => {
    const c = createMockAuthClient();
    await c.signIn("a@h.org", "pw");
    await expect(c.changePassword("pw", "short")).rejects.toMatchObject({
      code: "weak_password",
    });
    await expect(
      c.changePassword("wrong", "a-long-enough-password"),
    ).rejects.toMatchObject({ code: "wrong_password" });
    await c.changePassword(null, "a-long-enough-password");
    await c.requestPasswordReset("anyone@anywhere.org");
    await expect(
      c.resetPassword("old", "a-long-enough-password"),
    ).rejects.toMatchObject({ code: "link_expired" });
    await c.resetPassword(MOCK_RESET_TOKEN, "a-long-enough-password");
  });

  it("lists devices and signs them out", async () => {
    const c = createMockAuthClient();
    await c.signIn("a@h.org", "pw");
    const devices = await c.listDevices();
    expect(devices.filter((d) => d.current)).toHaveLength(1);
    const other = devices.find((d) => !d.current)!;
    await c.signOutDevice(other.id);
    expect(await c.listDevices()).toHaveLength(devices.length - 1);
    await c.signOutEverywhere();
    expect(await c.getSession()).toBeNull();
  });

  it("offers every capability, so the demo shows the whole design", () => {
    expect(Object.values(createMockAuthClient().capabilities)).not.toContain(
      false,
    );
  });

  it("makes initials from a display name", () => {
    expect(initials("Dr. Reyes")).toBe("DR");
    expect(initials("Ana Maria Reyes")).toBe("AM");
    expect(initials("  ")).toBe("?");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/auth/mock.test.ts`
Expected: FAIL with "Failed to resolve import "./types"".

- [ ] **Step 3: Write the types**

`lib/auth/types.ts`:

```ts
export type Role = "clinician" | "admin" | "auditor" | "researcher";

/** The signed-in person, as the UI shows them. Fields the API doesn't have yet are null. */
export interface User {
  username: string;
  email: string | null;
  /** Short name for the sidebar and greetings, e.g. "Dr. Reyes". */
  displayName: string;
  fullName: string | null;
  role: Role;
  /** Job title from hospital records, e.g. "Attending physician". */
  roleTitle: string | null;
  specialty: string | null;
  hospital: string | null;
  mfaEnabled: boolean;
}

/** First sign-in steps still to do, in this order. */
export type FirstStep = "terms" | "password" | "mfa";

export type SignInResult =
  | { status: "signed_in"; user: User; steps: FirstStep[] }
  | { status: "mfa_required" };

/** What the current backend supports. The UI hides anything that's false. */
export interface Capabilities {
  /** "Continue with hospital account" (single sign-on). */
  sso: boolean;
  /** Sign in with a work email (otherwise a username). */
  emailLogin: boolean;
  passwordReset: boolean;
  /** Active devices, sign out one, sign out everywhere. */
  devices: boolean;
  trustDevice: boolean;
}

export type AuthErrorCode =
  | "invalid_credentials"
  | "locked"
  | "mfa_invalid"
  | "mfa_expired"
  | "rate_limited"
  | "weak_password"
  | "wrong_password"
  | "link_expired"
  | "session_expired"
  | "unavailable";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    /** Only when the backend says so; never guessed. */
    readonly attemptsLeft?: number,
  ) {
    super(code);
    this.name = "AuthError";
  }
}

export interface Device {
  id: string;
  /** e.g. "Chrome on Windows · Ward 4 PC" */
  label: string;
  place: string | null;
  lastActiveAt: number;
  current: boolean;
}

export interface MfaSetup {
  otpauthUri: string;
  /** The same secret as text, for "Can't scan?". */
  secret: string;
  /** Ten one-time codes, shown once. */
  backupCodes: string[];
}

/** Who is signed in, and the first sign-in steps they still owe. */
export interface Session {
  user: User;
  steps: FirstStep[];
}

export interface AuthClient {
  readonly capabilities: Capabilities;
  getSession(): Promise<Session | null>;
  signIn(login: string, password: string): Promise<SignInResult>;
  signInWithHospital(): Promise<SignInResult>;
  verifyCode(
    code: string,
    opts: { backup: boolean; trustDevice: boolean },
  ): Promise<SignInResult>;
  signOut(): Promise<void>;
  acceptTerms(): Promise<void>;
  /** `current` is null during first sign-in (temporary password). */
  changePassword(current: string | null, next: string): Promise<void>;
  startMfaSetup(): Promise<MfaSetup>;
  confirmMfaSetup(code: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, next: string): Promise<void>;
  listDevices(): Promise<Device[]>;
  signOutDevice(id: string): Promise<void>;
  signOutEverywhere(): Promise<void>;
}

/** Only clinicians use this app; every other role gets the 403 page. */
export const isClinical = (u: User | null) => u?.role === "clinician";

/** "Dr. Reyes" → "DR"; "Ana Maria Reyes" → "AM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
```

- [ ] **Step 4: Write the mock client**

`lib/auth/mock.ts`:

```ts
import {
  AuthError,
  type AuthClient,
  type Device,
  type FirstStep,
  type Role,
  type SignInResult,
  type User,
} from "./types";

export const MOCK_CODE = "123456";
export const MOCK_RESET_TOKEN = "demo";
export const MOCK_BACKUP_CODES = [
  "4F7K-92QX",
  "M8TD-31LP",
  "Z2HV-7R6C",
  "Q9WE-5N4B",
  "K3YU-8J2D",
  "P6RA-1T9M",
  "B5NC-4X7H",
  "W1GZ-6E3V",
  "D8LS-2K5Q",
  "H7MF-9P1Y",
];
const SECRET = "JBSWY3DPEHPK3PXP";
const LOCK_MS = 15 * 60_000;
const MAX_TRIES = 5;

const trigger = (login: string) =>
  login
    .toLowerCase()
    .split("@")[0]!
    .split(/[._+-]/)[0] ?? "";
const normalizeBackup = (c: string) =>
  c
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(.{4})(.{4})$/, "$1-$2");

function userFor(login: string, role: Role, mfaEnabled: boolean): User {
  const clinician = role === "clinician";
  return {
    username: login.split("@")[0]!,
    email: login.includes("@") ? login : null,
    displayName: "Dr. Reyes",
    fullName: "Dr. Ana Reyes",
    role,
    roleTitle: clinician
      ? "Attending physician"
      : role === "admin"
        ? "Hospital admin"
        : "Auditor",
    specialty: clinician ? "Internal Medicine" : null,
    hospital: "Havana Hospital",
    mfaEnabled,
  };
}

/** The demo's sign-in: memory only (a reload signs you out), never stored. */
export function createMockAuthClient({
  now = () => Date.now(),
}: { now?: () => number } = {}): AuthClient {
  let session: User | null = null;
  let steps: FirstStep[] = [];
  let pending: User | null = null;
  let backupLeft = new Set(MOCK_BACKUP_CODES);
  const failures = new Map<string, number>();
  const lockedUntil = new Map<string, number>();
  let devices: Device[] = [];

  const startSession = (u: User, owed: FirstStep[] = []): void => {
    session = u;
    steps = owed;
    devices = [
      {
        id: "this",
        label: "Chrome on Windows · Ward 4 PC",
        place: "Lagos",
        lastActiveAt: now(),
        current: true,
      },
      {
        id: "phone",
        label: "Safari on iPhone",
        place: "Lagos",
        lastActiveAt: now() - 2 * 3_600_000,
        current: false,
      },
    ];
  };
  const requireSession = () => {
    if (!session) throw new AuthError("session_expired");
    return session;
  };
  const strong = (pw: string) => {
    if (pw.length < 12) throw new AuthError("weak_password");
  };
  const done = (step: FirstStep) => {
    steps = steps.filter((s) => s !== step);
  };

  return {
    capabilities: {
      sso: true,
      emailLogin: true,
      passwordReset: true,
      devices: true,
      trustDevice: true,
    },

    async getSession() {
      return session ? { user: session, steps: [...steps] } : null;
    },

    async signIn(login, password): Promise<SignInResult> {
      const key = login.trim().toLowerCase();
      if ((lockedUntil.get(key) ?? 0) > now()) throw new AuthError("locked");
      const word = trigger(key);
      if (word === "locked") throw new AuthError("locked");
      if (password === "wrong") {
        const n = (failures.get(key) ?? 0) + 1;
        failures.set(key, n);
        if (n >= MAX_TRIES) {
          failures.delete(key);
          lockedUntil.set(key, now() + LOCK_MS);
          throw new AuthError("locked");
        }
        throw new AuthError("invalid_credentials", MAX_TRIES - n);
      }
      failures.delete(key);
      if (word === "mfa") {
        pending = userFor(key, "clinician", true);
        return { status: "mfa_required" };
      }
      if (word === "new") {
        const u = userFor(key, "clinician", false);
        const owed: FirstStep[] = ["terms", "password", "mfa"];
        startSession(u, owed);
        return { status: "signed_in", user: u, steps: [...owed] };
      }
      const role: Role =
        word === "admin"
          ? "admin"
          : word === "auditor"
            ? "auditor"
            : "clinician";
      const u = userFor(key, role, true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async signInWithHospital() {
      const u = userFor("a.reyes@havanahospital.org", "clinician", true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async verifyCode(code, { backup }) {
      if (!pending) throw new AuthError("mfa_expired");
      if (backup) {
        const c = normalizeBackup(code);
        if (!backupLeft.has(c)) throw new AuthError("mfa_invalid");
        backupLeft.delete(c);
      } else if (code.replace(/\D/g, "") !== MOCK_CODE) {
        throw new AuthError("mfa_invalid");
      }
      const u = pending;
      pending = null;
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async signOut() {
      session = null;
      steps = [];
      pending = null;
    },

    async acceptTerms() {
      requireSession();
      done("terms");
    },

    async changePassword(current, next) {
      requireSession();
      if (current === "wrong") throw new AuthError("wrong_password");
      strong(next);
      done("password");
    },

    async startMfaSetup() {
      const u = requireSession();
      backupLeft = new Set(MOCK_BACKUP_CODES);
      return {
        otpauthUri: `otpauth://totp/MHAI:${encodeURIComponent(u.username)}?secret=${SECRET}&issuer=MHAI`,
        secret: SECRET,
        backupCodes: [...MOCK_BACKUP_CODES],
      };
    },

    async confirmMfaSetup(code) {
      const u = requireSession();
      if (code.replace(/\D/g, "") !== MOCK_CODE)
        throw new AuthError("mfa_invalid");
      session = { ...u, mfaEnabled: true };
      done("mfa");
    },

    async requestPasswordReset() {
      // Same reply whether or not the email exists.
    },

    async resetPassword(token, next) {
      if (token !== MOCK_RESET_TOKEN) throw new AuthError("link_expired");
      strong(next);
    },

    async listDevices() {
      requireSession();
      return devices;
    },

    async signOutDevice(id) {
      requireSession();
      devices = devices.filter((d) => d.current || d.id !== id);
    },

    async signOutEverywhere() {
      devices = [];
      session = null;
      steps = [];
    },
  };
}
```

- [ ] **Step 5: Write `getAuthClient`**

`lib/auth/client.ts`:

```ts
import { createMockAuthClient } from "./mock";
import type { AuthClient } from "./types";

let client: AuthClient | undefined;

/** Task 1 ships mock mode only. Task 12 adds the live client behind the BFF. */
export function getAuthClient(): AuthClient {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") {
    throw new Error(
      "Live sign-in arrives in Task 12. Set NEXT_PUBLIC_USE_MOCK=true.",
    );
  }
  return (client ??= createMockAuthClient());
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/auth/mock.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Run the checks and commit**

Run: `npx prettier --write lib/auth && npm run lint && npm run typecheck`
Expected: no errors.

```bash
git add lib/auth
git commit -m "Add auth types and the memory-only mock auth client"
```

---

### Task 2: Password rules and the password fields

**Files:**

- Create: `lib/auth/password-rules.ts`, `lib/auth/password-rules.test.ts`, `components/auth/password-fields.tsx`, `components/auth/password-fields.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `passwordRules(pw: string, identity: string | null): PasswordRule[]`,
    where `PasswordRule` is `{ id: "length" | "common" | "identity";
label: string; ok: boolean }`;
  - `passwordError(next: string, confirm: string, identity: string |
null): string | null`;
  - `COMMON_PASSWORDS: ReadonlySet<string>`;
  - `<PasswordFields next confirm onNext onConfirm identity showErrors
/>`, which renders the new-password field, the confirm field and the
    live rule ticks.

**Rules (design 8c):**

- At least 12 characters.
- Not a common or leaked password. In the browser this checks the bundled
  common list and rejects a single repeated character; the server does
  the real leaked-password check.
- Not your email: the email's local part, or the username, can't appear
  in the password (case-insensitive).

- [ ] **Step 1: Write the failing tests**

`lib/auth/password-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { passwordError, passwordRules } from "./password-rules";

const ok = (pw: string, id: string | null = "a.reyes@havanahospital.org") =>
  Object.fromEntries(passwordRules(pw, id).map((r) => [r.id, r.ok]));

describe("passwordRules", () => {
  it("needs 12 characters", () => {
    expect(ok("short-pass1").length).toBe(false);
    expect(ok("long-enough-pass").length).toBe(true);
  });
  it("rejects common passwords and one repeated character", () => {
    expect(ok("password1234").common).toBe(false);
    expect(ok("PASSWORD1234").common).toBe(false);
    expect(ok("aaaaaaaaaaaaaa").common).toBe(false);
    expect(ok("tram-lantern-okra").common).toBe(true);
  });
  it("can't contain the email's name part or the username", () => {
    expect(ok("A.Reyes-2026-ward").identity).toBe(false);
    expect(ok("tram-lantern-okra").identity).toBe(true);
    expect(ok("tram-lantern-okra", null).identity).toBe(true);
  });
  it("leaves every rule unticked while empty", () => {
    expect(Object.values(ok(""))).toEqual([false, false, false]);
  });
});

describe("passwordError", () => {
  it("explains what's wrong, rules first", () => {
    expect(passwordError("short", "short", null)).toBe(
      "Choose a password that meets every rule.",
    );
    expect(passwordError("tram-lantern-okra", "tram-lantern-okr", null)).toBe(
      "The passwords don't match.",
    );
    expect(
      passwordError("tram-lantern-okra", "tram-lantern-okra", null),
    ).toBeNull();
  });
});
```

`components/auth/password-fields.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PasswordFields } from "./password-fields";

function Harness({ showErrors = false }: { showErrors?: boolean }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <PasswordFields
      next={next}
      confirm={confirm}
      onNext={setNext}
      onConfirm={setConfirm}
      identity="a.reyes@havanahospital.org"
      showErrors={showErrors}
    />
  );
}

describe("PasswordFields", () => {
  it("ticks rules as you type, in words not just colour", async () => {
    render(<Harness />);
    const rule = () =>
      screen.getByText("At least 12 characters").closest("li")!;
    expect(rule()).toHaveAccessibleName(/not met/);
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    expect(rule()).toHaveAccessibleName(/met/);
    expect(rule()).not.toHaveAccessibleName(/not met/);
  });
  it("shows the mismatch only once errors are on", async () => {
    const { rerender } = render(<Harness />);
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await userEvent.type(screen.getByLabelText("Confirm password"), "tram");
    expect(screen.queryByText("The passwords don't match.")).toBeNull();
    rerender(<Harness showErrors />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The passwords don't match.",
    );
  });
  it("uses password inputs with the right autocomplete", () => {
    render(<Harness />);
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "type",
      "password",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/auth/password-rules.test.ts components/auth/password-fields.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the rules**

`lib/auth/password-rules.ts`:

```ts
/** A short list of the most common passwords. The server checks leaked lists. */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "123456789012",
  "1234567890123",
  "password1234",
  "password12345",
  "passwordpassword",
  "qwertyuiop12",
  "qwertyuiopas",
  "iloveyou1234",
  "welcome12345",
  "letmein12345",
  "administrator",
  "changeme1234",
  "abcdefghijkl",
  "abc123456789",
  "111111111111",
  "000000000000",
  "trustno1trustno1",
  "football1234",
  "baseball1234",
  "sunshine1234",
  "princess1234",
  "monkey123456",
  "dragon123456",
  "superman1234",
  "hospital1234",
  "doctor123456",
  "nurse1234567",
  "medicine1234",
  "passw0rd1234",
  "p@ssw0rd1234",
  "p@ssword1234",
  "qwerty123456",
  "1q2w3e4r5t6y",
  "zaq12wsxcde3",
  "asdfghjkl123",
  "mhai12345678",
]);

export interface PasswordRule {
  id: "length" | "common" | "identity";
  label: string;
  ok: boolean;
}

export function passwordRules(
  pw: string,
  identity: string | null,
): PasswordRule[] {
  const lower = pw.toLowerCase();
  const name = identity?.split("@")[0]?.toLowerCase() ?? "";
  return [
    { id: "length", label: "At least 12 characters", ok: pw.length >= 12 },
    {
      id: "common",
      label: "Not a common or leaked password",
      ok: pw.length > 0 && !COMMON_PASSWORDS.has(lower) && !/^(.)\1*$/.test(pw),
    },
    {
      id: "identity",
      label: "Not your email",
      ok: pw.length > 0 && (name.length < 3 || !lower.includes(name)),
    },
  ];
}

export function passwordError(
  next: string,
  confirm: string,
  identity: string | null,
): string | null {
  if (!passwordRules(next, identity).every((r) => r.ok))
    return "Choose a password that meets every rule.";
  if (next !== confirm) return "The passwords don't match.";
  return null;
}
```

- [ ] **Step 4: Write the fields**

`components/auth/password-fields.tsx`:

```tsx
"use client";
import { Check, Circle } from "lucide-react";
import { useId } from "react";
import { passwordError, passwordRules } from "@/lib/auth/password-rules";
import { cn } from "../ui/cn";

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14.5px] focus-visible:outline-2 focus-visible:outline-mint-deep aria-invalid:border-bad";

/** New password + confirm, with the design's live rule ticks (8c). */
export function PasswordFields({
  next,
  confirm,
  onNext,
  onConfirm,
  identity,
  showErrors,
}: {
  next: string;
  confirm: string;
  onNext(v: string): void;
  onConfirm(v: string): void;
  identity: string | null;
  showErrors: boolean;
}) {
  const id = useId();
  const rules = passwordRules(next, identity);
  const error = showErrors ? passwordError(next, confirm, identity) : null;
  const mismatch = error === "The passwords don't match.";
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label
          htmlFor={`${id}-new`}
          className="mb-1.5 block text-[13px] font-semibold"
        >
          New password
        </label>
        <input
          id={`${id}-new`}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => onNext(e.target.value)}
          aria-describedby={`${id}-rules`}
          aria-invalid={error && !mismatch ? true : undefined}
          className={inputClass}
        />
      </div>
      <ul id={`${id}-rules`} aria-live="polite" className="flex flex-col gap-1">
        {rules.map((r) => (
          <li
            key={r.id}
            aria-label={`${r.label}: ${r.ok ? "met" : "not met"}`}
            className={cn(
              "flex items-center gap-2 text-[13px]",
              r.ok ? "text-ok-deep" : "text-ink-3",
            )}
          >
            {r.ok ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <Circle aria-hidden className="size-3.5" />
            )}
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      <div>
        <label
          htmlFor={`${id}-confirm`}
          className="mb-1.5 block text-[13px] font-semibold"
        >
          Confirm password
        </label>
        <input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          aria-invalid={mismatch ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={inputClass}
        />
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/auth/password-rules.test.ts components/auth/password-fields.test.tsx`
Expected: PASS. (`rerender` with the same component type keeps the typed
values, which is why `Harness` is declared at module level.)

- [ ] **Step 6: Commit**

```bash
npx prettier --write lib/auth components/auth && npm run lint && npm run typecheck
git add lib/auth/password-rules.ts lib/auth/password-rules.test.ts components/auth/password-fields.tsx components/auth/password-fields.test.tsx
git commit -m "Add password rules and the new-password fields"
```

---

### Task 3: Auth provider, the sign-in gate and sign-out

**Files:**

- Create:
  - `lib/auth/auth-context.tsx`
  - `lib/auth/auth-context.test.tsx`
  - `components/auth/auth-gate.tsx`
  - `components/auth/auth-gate.test.tsx`
  - `tests/auth-wrapper.tsx`
- Modify:
  - `app/providers.tsx`
  - `components/states/session-timeout.tsx`
  - `components/states/signed-out-notice.tsx`
  - `components/states/states.test.tsx`
  - `components/shell/sidebar.tsx`
  - `components/shell/sidebar.test.tsx`
  - `app/(clinical)/layout.tsx`
  - `app/(clinical)/page.tsx`
  - `app/print/[id]/page.tsx`
  - `tests/setup.ts`
  - `tests/e2e/clinical-flow.spec.ts`
- Move: `app/(clinical)/ended/` to `app/ended/`, so dead links show the
  404 without needing sign-in.

**Interfaces:**

- Consumes: `AuthClient`, `Session`, `User`, `FirstStep`, `SignInResult`,
  `isClinical`, `getAuthClient` (Task 1); `useSession().clear()` (Plan 1).
- Produces:
  - `AuthProvider({ children, client?, initialUser? })`. `initialUser`
    skips the session lookup: a `User` means signed in, `null` means
    signed out.
  - `useAuth(): AuthCtx`, where `AuthCtx` is:

    ```ts
    {
      status: "loading" | "signed_out" | "signed_in";
      user: User | null;
      steps: FirstStep[];
      mfaPending: boolean;
      capabilities: Capabilities;
      client: AuthClient;
      signedOutReason: SignOutReason | null;
      dismissNotice(): void;
      signIn(login, password): Promise<SignInResult>;
      signInWithHospital(): Promise<SignInResult>;
      verifyCode(code, opts): Promise<SignInResult>;
      cancelMfa(): void;
      completeStep(step: FirstStep): void;
      updateUser(patch: Partial<User>): void;
      signOut(reason: SignOutReason): Promise<void>;
    }
    ```

  - `type SignOutReason = "idle" | "manual" | "expired"`.
  - `homeFor(s: { user: User | null; steps: FirstStep[] }): string`.
  - `AuthGate({ children })`.
  - `TEST_USER`, `FROM_CLIENT`, `AuthTestProvider` and
    `renderWithAuth(ui, user?, client?)` in `tests/auth-wrapper.tsx`.
    Passing `FROM_CLIENT` as `user` lets the provider load the session
    from the client.
  - `SessionTimeout` now takes a required `onSignOut()` and no longer
    clears or navigates itself.
  - `SessionGuard` runs the idle timer only while signed in.
  - `useSignedOutNotice` is removed: the notice reads
    `useAuth().signedOutReason`.

**Behaviour:**

- **`homeFor`** picks where a signed-in person belongs:
  - `/welcome` while first sign-in steps are owed;
  - otherwise `/no-access` for a non-clinician;
  - otherwise `/`.
- **`AuthGate`** renders its children only when signed in, done with
  first sign-in, and a clinician. Otherwise it renders nothing and calls
  `router.replace()`:
  - `/sign-in` when signed out;
  - `homeFor(...)` otherwise.

  Nothing clinical mounts before the check, so no clinical query runs.

- **`signOut(reason)`** is idempotent: it does nothing if already signed
  out with nothing pending. In one transition it:
  - clears the session history and query cache (`session.clear()`);
  - sets `signed_out` and the reason;
  - calls `router.replace("/sign-in")`.

  Then it calls `client.signOut()` as a best effort.

- **The notice** on the sign-in page (placed in Task 4) says why the
  person was signed out:
  - **idle:** "Signed out for privacy". "You were signed out after 15
    minutes of inactivity. Unsaved work was cleared to protect patient
    data."
  - **manual:** "You've signed out". "Your session history was cleared
    from this device."
  - **expired:** "Your session ended". "Sign in again to continue. Unsaved
    work was cleared to protect patient data."

  This fixes Plan 1's parked issue, where a manual sign-out said
  "inactivity".

- [ ] **Step 1: Write the test wrapper**

`tests/auth-wrapper.tsx`:

```tsx
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { createMockAuthClient } from "@/lib/auth/mock";
import type { AuthClient, User } from "@/lib/auth/types";
import { SessionProvider } from "@/lib/session-store";

export const TEST_USER: User = {
  username: "a.reyes",
  email: "a.reyes@havanahospital.org",
  displayName: "Dr. Reyes",
  fullName: "Dr. Ana Reyes",
  role: "clinician",
  roleTitle: "Attending physician",
  specialty: "Internal Medicine",
  hospital: "Havana Hospital",
  mfaEnabled: true,
};

/** Pass as `user` to let the provider load the session from the client. */
export const FROM_CLIENT = Symbol("from client");
type StartUser = User | null | typeof FROM_CLIENT;

/** Query cache, session history and a signed-in mock user. */
export function AuthTestProvider({
  children,
  user = TEST_USER,
  client,
}: {
  children: ReactNode;
  user?: StartUser;
  client?: AuthClient;
}) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <AuthProvider
          client={client ?? createMockAuthClient()}
          initialUser={user === FROM_CLIENT ? undefined : user}
        >
          {children}
        </AuthProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export const renderWithAuth = (
  ui: ReactElement,
  user?: StartUser,
  client?: AuthClient,
) =>
  render(
    <AuthTestProvider user={user} client={client}>
      {ui}
    </AuthTestProvider>,
  );
```

Append to `tests/setup.ts`, so `<Providers>` in existing tests gets the
mock auth client:

```ts
// Component tests run in mock mode unless a test stubs the flag itself.
process.env.NEXT_PUBLIC_USE_MOCK ??= "true";
```

- [ ] **Step 2: Write the failing tests**

`lib/auth/auth-context.test.tsx`:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient } from "./mock";
import { AuthProvider, homeFor, useAuth } from "./auth-context";
import type { AuthClient } from "./types";
import { SessionProvider, useSession } from "../session-store";
import { TEST_USER } from "@/tests/auth-wrapper";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

let api: ReturnType<typeof useAuth>;
let history: ReturnType<typeof useSession>;
function Probe() {
  api = useAuth();
  history = useSession();
  return <p data-testid="status">{api.status}</p>;
}
const mount = (client: AuthClient, initialUser?: typeof TEST_USER | null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <AuthProvider client={client} initialUser={initialUser}>
          <Probe />
        </AuthProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );

describe("AuthProvider", () => {
  it("looks up the session on mount", async () => {
    const client = createMockAuthClient();
    await client.signIn("new@h.org", "pw");
    mount(client);
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("signed_in"),
    );
    expect(api.steps).toEqual(["terms", "password", "mfa"]);
  });

  it("signs in, tracks a pending code, and finishes first sign-in steps", async () => {
    mount(createMockAuthClient(), null);
    await act(() => api.signIn("mfa@h.org", "pw"));
    expect(api.mfaPending).toBe(true);
    expect(api.status).toBe("signed_out");
    await act(() =>
      api.verifyCode("123456", { backup: false, trustDevice: false }),
    );
    expect(api.status).toBe("signed_in");
    expect(api.mfaPending).toBe(false);
    act(() => api.completeStep("terms"));
    expect(api.steps).toEqual([]);
  });

  it("signs out once, clears history, and says why", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "signOut");
    mount(client, TEST_USER);
    act(() =>
      history.add({
        id: "q1",
        title: "t",
        urgency: "routine",
        createdAt: 1,
        query: {} as never,
      }),
    );
    await act(() => api.signOut("manual"));
    await act(() => api.signOut("expired"));
    expect(api.status).toBe("signed_out");
    expect(api.signedOutReason).toBe("manual");
    expect(history.items).toEqual([]);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => api.dismissNotice());
    expect(api.signedOutReason).toBeNull();
  });
});

describe("homeFor", () => {
  it("sends people where they belong", () => {
    expect(homeFor({ user: TEST_USER, steps: ["terms"] })).toBe("/welcome");
    expect(homeFor({ user: { ...TEST_USER, role: "admin" }, steps: [] })).toBe(
      "/no-access",
    );
    expect(homeFor({ user: TEST_USER, steps: [] })).toBe("/");
  });
});
```

`components/auth/auth-gate.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { AuthGate } from "./auth-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

const Clinical = vi.fn(() => <p>clinical screen</p>);
const gated = () => (
  <AuthGate>
    <Clinical />
  </AuthGate>
);

describe("AuthGate", () => {
  it("shows the clinical app to a signed-in clinician", () => {
    renderWithAuth(gated());
    expect(screen.getByText("clinical screen")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
  it("sends a signed-out visitor to sign in, mounting nothing", async () => {
    Clinical.mockClear();
    renderWithAuth(gated(), null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  it("sends an admin to the 403 page, mounting nothing clinical", async () => {
    Clinical.mockClear();
    renderWithAuth(gated(), { ...TEST_USER, role: "admin" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/no-access"));
    expect(Clinical).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/auth/auth-context.test.tsx components/auth/auth-gate.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 4: Write the provider**

`lib/auth/auth-context.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "../session-store";
import { getAuthClient } from "./client";
import {
  isClinical,
  type AuthClient,
  type Capabilities,
  type FirstStep,
  type SignInResult,
  type User,
} from "./types";

export type SignOutReason = "idle" | "manual" | "expired";
type Status = "loading" | "signed_out" | "signed_in";
type State = { status: Status; user: User | null; steps: FirstStep[] };

export interface AuthCtx extends State {
  mfaPending: boolean;
  capabilities: Capabilities;
  client: AuthClient;
  signedOutReason: SignOutReason | null;
  dismissNotice(): void;
  signIn(login: string, password: string): Promise<SignInResult>;
  signInWithHospital(): Promise<SignInResult>;
  verifyCode(
    code: string,
    opts: { backup: boolean; trustDevice: boolean },
  ): Promise<SignInResult>;
  cancelMfa(): void;
  completeStep(step: FirstStep): void;
  updateUser(patch: Partial<User>): void;
  signOut(reason: SignOutReason): Promise<void>;
}

const SIGNED_OUT: State = { status: "signed_out", user: null, steps: [] };
const Ctx = createContext<AuthCtx | null>(null);

/** Where a signed-in person belongs right now. */
export function homeFor(s: { user: User | null; steps: FirstStep[] }) {
  if (s.steps.length) return "/welcome";
  return isClinical(s.user) ? "/" : "/no-access";
}

/**
 * Who is signed in, in memory only (never browser storage). In live mode
 * the session itself is an httpOnly cookie that this code never reads.
 */
export function AuthProvider({
  children,
  client: given,
  initialUser,
}: {
  children: ReactNode;
  client?: AuthClient;
  /** A user (signed in) or null (signed out) skips the session lookup. */
  initialUser?: User | null;
}) {
  const [client] = useState(() => given ?? getAuthClient());
  const history = useSession();
  const router = useRouter();
  const [state, setState] = useState<State>(() =>
    initialUser === undefined
      ? { status: "loading", user: null, steps: [] }
      : initialUser
        ? { status: "signed_in", user: initialUser, steps: [] }
        : SIGNED_OUT,
  );
  const [mfaPending, setMfaPending] = useState(false);
  const [reason, setReason] = useState<SignOutReason | null>(null);
  // Read by signOut to stay idempotent; written only in an effect.
  const live = useRef({ signedIn: state.status === "signed_in", mfaPending });
  useEffect(() => {
    live.current = { signedIn: state.status === "signed_in", mfaPending };
  }, [state.status, mfaPending]);

  useEffect(() => {
    if (initialUser !== undefined) return;
    let on = true;
    client
      .getSession()
      .then((s) => {
        if (on)
          setState(
            s
              ? { status: "signed_in", user: s.user, steps: s.steps }
              : SIGNED_OUT,
          );
      })
      .catch(() => on && setState(SIGNED_OUT));
    return () => {
      on = false;
    };
  }, [client, initialUser]);

  const apply = useCallback((r: SignInResult) => {
    if (r.status === "mfa_required") {
      setMfaPending(true);
      return r;
    }
    setMfaPending(false);
    setReason(null);
    setState({ status: "signed_in", user: r.user, steps: r.steps });
    return r;
  }, []);

  const signOut = useCallback(
    async (why: SignOutReason) => {
      if (!live.current.signedIn && !live.current.mfaPending) return;
      live.current = { signedIn: false, mfaPending: false };
      startTransition(() => {
        history.clear();
        setState(SIGNED_OUT);
        setMfaPending(false);
        setReason(why);
        router.replace("/sign-in");
      });
      await client.signOut().catch(() => {});
    },
    [client, history, router],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      ...state,
      mfaPending,
      capabilities: client.capabilities,
      client,
      signedOutReason: reason,
      dismissNotice: () => setReason(null),
      signIn: async (login, password) =>
        apply(await client.signIn(login, password)),
      signInWithHospital: async () => apply(await client.signInWithHospital()),
      verifyCode: async (code, opts) =>
        apply(await client.verifyCode(code, opts)),
      cancelMfa: () => setMfaPending(false),
      completeStep: (step) =>
        setState((s) => ({ ...s, steps: s.steps.filter((x) => x !== step) })),
      updateUser: (patch) =>
        setState((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s)),
      signOut,
    }),
    [state, mfaPending, client, reason, apply, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
```

- [ ] **Step 5: Write the gate**

`components/auth/auth-gate.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";

/**
 * Clinical screens only for a signed-in clinician who has finished first
 * sign-in. Everyone else is redirected, and nothing clinical mounts
 * meanwhile (no clinical query can run).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, steps } = useAuth();
  const router = useRouter();
  const target =
    status === "signed_out"
      ? "/sign-in"
      : status === "signed_in" && homeFor({ user, steps }) !== "/"
        ? homeFor({ user, steps })
        : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (status !== "signed_in" || target) return null;
  return children;
}
```

- [ ] **Step 6: Wire the provider, the idle sign-out and the notice**

`app/providers.tsx`: put `AuthProvider` inside `ToastProvider` and around
`SessionGuard`, and pass through an optional `auth` prop for tests:

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SessionGuard } from "@/components/states/session-timeout";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth/auth-context";
import type { AuthClient, User } from "@/lib/auth/types";
import { SessionProvider } from "@/lib/session-store";

export function Providers({
  children,
  auth,
}: {
  children: ReactNode;
  /** Tests only: a specific client or a starting user. */
  auth?: { client?: AuthClient; initialUser?: User | null };
}) {
  // Memory-only cache: no persister is ever attached (no PHI in browser storage).
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <ToastProvider>
          <AuthProvider client={auth?.client} initialUser={auth?.initialUser}>
            {/* Idle sign-out on every route, including /print, while signed in. */}
            <SessionGuard>{children}</SessionGuard>
          </AuthProvider>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
```

`components/states/session-timeout.tsx`, `SessionTimeout`:

- remove the `useSession`, `useRouter` and `startTransition` imports and
  uses;
- make `onSignOut` required;
- replace the `signOut` effect event with:

```tsx
// Leaves `deadline` in the past (dialog closed) until the next idle period.
const signOut = useEffectEvent(() => {
  restart();
  onSignOut();
  show({
    title: "Signed out for privacy",
    body: "Your session was cleared after inactivity.",
  });
});
```

Update its doc comment: sign-out is handed to `onSignOut`, and
`SessionGuard` passes `useAuth().signOut("idle")`.

Replace everything from `type SignedOut = {` to the end of the file with:

```tsx
/**
 * Mounted once in Providers (root layout), so every route, including
 * /print, has the idle sign-out while someone is signed in. On sign-out it
 * remounts the app below it, dropping in-memory page state such as an open
 * draft. Why they were signed out is kept by AuthProvider (memory only).
 */
export function SessionGuard({
  children,
  ...timing
}: Timing & { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const { status, signOut } = useAuth();
  const onSignOut = useCallback(() => {
    setEpoch((n) => n + 1);
    void signOut("idle");
  }, [signOut]);
  return (
    <>
      <Fragment key={epoch}>{children}</Fragment>
      {status === "signed_in" && (
        <SessionTimeout {...timing} onSignOut={onSignOut} />
      )}
    </>
  );
}
```

Add `import { useAuth } from "@/lib/auth/auth-context";`, and drop the
now-unused `createContext`, `useContext` and `useMemo` imports.

`components/states/signed-out-notice.tsx`:

```tsx
"use client";
import { useAuth, type SignOutReason } from "@/lib/auth/auth-context";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";

const COPY: Record<SignOutReason, { title: string; body: string }> = {
  idle: {
    title: "Signed out for privacy",
    body: "You were signed out after 15 minutes of inactivity. Unsaved work was cleared to protect patient data.",
  },
  manual: {
    title: "You've signed out",
    body: "Your session history was cleared from this device.",
  },
  expired: {
    title: "Your session ended",
    body: "Sign in again to continue. Unsaved work was cleared to protect patient data.",
  },
};

/** Why you were signed out, until dismissed. Memory only. */
export function SignedOutNotice() {
  const { signedOutReason, dismissNotice } = useAuth();
  if (!signedOutReason) return null;
  const { title, body } = COPY[signedOutReason];
  return (
    <div className="mb-5">
      <Banner tone="info" title={title}>
        <p>{body}</p>
        <Button variant="ghost" className="mt-2" onClick={dismissNotice}>
          Dismiss
        </Button>
      </Banner>
    </div>
  );
}
```

- [ ] **Step 7: Gate the clinical routes and print, and show the real user**

`app/(clinical)/layout.tsx`:

```tsx
import { ViewTransition } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/shell/app-shell";

export default function ClinicalLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <AppShell>
        <ViewTransition name="main-content">{children}</ViewTransition>
      </AppShell>
    </AuthGate>
  );
}
```

`app/print/[id]/page.tsx`: wrap the existing `<Suspense>` in
`<AuthGate>…</AuthGate>`, with the same import.

Move the dead-link 404 out of the gate. `proxy.ts` keeps rewriting to
`/ended`, which is unchanged:

```bash
git mv "app/(clinical)/ended" app/ended
```

`components/shell/sidebar.tsx`:

- delete `DEMO_USER`;
- read `const { user } = useAuth();`;
- render the footer block only when `user` is set, using:
  - `initials(user.displayName)` in the avatar;
  - `user.displayName`;
  - `[user.roleTitle, user.specialty].filter(Boolean).join(" · ")` as the
    role line, rendered only when non-empty;
  - `user.hospital` as the hospital line, rendered only when set;
  - a `title` built from the same parts.

(Task 9 turns this footer into the account menu.)

`app/(clinical)/page.tsx`:

- drop the `DEMO_USER` import;
- drop `<SignedOutNotice />` (it moves to the sign-in page in Task 4);
- pass `name={useAuth().user?.displayName ?? ""}` to `FirstVisit`, read
  once at the top of the component as `const { user } = useAuth();`.

- [ ] **Step 8: Update the existing tests**

`components/shell/sidebar.test.tsx`: import `renderWithAuth` from
`@/tests/auth-wrapper`, and replace every `render(<Sidebar` with
`renderWithAuth(<Sidebar`. The "Havana Hospital" assertion keeps passing.
Add one test:

```tsx
it("hides the account footer when nobody is signed in", () => {
  renderWithAuth(<Sidebar items={[]} />, null);
  expect(screen.queryByText("Havana Hospital")).not.toBeInTheDocument();
});
```

`components/states/states.test.tsx`:

- Make sure the `next/navigation` mock exposes `replace` as a shared
  `vi.fn()` cleared in `beforeEach`, next to `push`.
- In the `SessionTimeout` describe:
  - render `<SessionTimeout {...props} onSignOut={onSignOut} />`, with
    `const onSignOut = vi.fn();` reset in `beforeEach`;
  - replace each `expect(push).toHaveBeenCalledWith("/")` and
    `toHaveBeenCalledTimes(1)` on `push` with the same assertion on
    `onSignOut`;
  - delete the `count` → `0` assertions, because clearing is no longer
    this component's job.
- In "covers every route", render
  `<Providers auth={{ initialUser: TEST_USER }}>`, assert
  `expect(replace).toHaveBeenCalledWith("/sign-in")` in place of the
  `push` assertion, and keep the "Signed out for privacy" text assertion,
  since the toast still says it.
- In the `SessionGuard` describe, wrap the tree's `SessionProvider`
  children in `<AuthProvider client={createMockAuthClient()}
initialUser={TEST_USER}>`, and assert
  `expect(replace).toHaveBeenCalledWith("/sign-in")` in place of
  `push("/")`.
- Delete any test of `useSignedOutNotice` or of `SignedOutNotice` on the
  home page, and add:

```tsx
describe("SignedOutNotice", () => {
  it.each([
    ["idle", "Signed out for privacy", /15 minutes of inactivity/],
    ["manual", "You've signed out", /history was cleared/],
    ["expired", "Your session ended", /Sign in again/],
  ] as const)("explains a %s sign-out", async (why, title, body) => {
    function SignOut() {
      const { signOut } = useAuth();
      return <button onClick={() => void signOut(why)}>out</button>;
    }
    renderWithAuth(
      <>
        <SignOut />
        <SignedOutNotice />
      </>,
    );
    fireEvent.click(screen.getByText("out"));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
  });
});
```

The other suites that render `<Providers>`
(`components/consultation/*.test.tsx`, `app-shell.test.tsx`,
`command-palette.test.tsx`) need no change: `tests/setup.ts` puts them in
mock mode, and they render pages directly, not through the gated layout.

`tests/e2e/clinical-flow.spec.ts`: every full page load starts a new,
empty mock session, so sign in after each `goto`. Add:

```ts
async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("a.reyes@havanahospital.org");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}
```

In `fillForm`, replace `await page.goto("/");` with `await signIn(page);`.
The sign-in page itself arrives in Task 4, so run the e2e suite at the end
of Task 4, not here.

- [ ] **Step 9: Run the unit tests**

Run: `npx vitest run`
Expected: PASS, including the new auth-context and auth-gate tests.

- [ ] **Step 10: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Gate the clinical app behind sign-in and say why you were signed out"
```

---

### Task 4: The sign-in layout and the sign-in page

**Files:**

- Create:
  - `components/auth/auth-layout.tsx`
  - `components/auth/guest-gate.tsx`
  - `components/auth/demo-hint.tsx`
  - `components/auth/sign-in-form.tsx`
  - `components/auth/sign-in-form.test.tsx`
  - `app/(auth)/layout.tsx`
  - `app/(auth)/sign-in/page.tsx`

**Interfaces:**

- Consumes: `useAuth`, `homeFor` (Task 3); `AuthError` (Task 1);
  `SignedOutNotice` (Task 3); `Banner`, `Button`, `Logo`, `PartnerLine`
  (Plan 1); `inputClass` (Task 2).
- Produces:
  - `AuthLayout({ children })`: the brand panel and the form column, used
    by every `(auth)` page;
  - `GuestGate({ children })`: for pages that only signed-out people
    should see;
  - `AuthHeading({ eyebrow?, title, sub? })`;
  - `authErrorCopy(code, ctx): { title; body }`, the shared error wording;
  - `SignInForm`.

**Copy (design `account.html` 1 and 3):**

- **Brand panel:** "Better, quicker answers at the bedside." Then
  "Evidence-checked clinical decision support for every clinic, including
  the most resource-limited."
- **Trust points:**
  - "Patient details are masked before any analysis";
  - "Every claim is checked against clinical guidelines";
  - "You stay in control: the final decision is always yours".

  Then the partner line.

- **Form:**
  - heading "Welcome back", with "Sign in to continue to MHAI.";
  - an SSO button "Continue with hospital account", then "or use email";
  - the field "Work email" (or "Username" when `emailLogin` is false),
    then "Password" with a "Forgot?" link;
  - the button "Sign in";
  - the footer "Access is for registered clinicians. New here? Ask your
    hospital admin".
- **Errors** (a red banner, which also moves focus to it):

  | Code                                   | Title                                                  | Body                                                                                                               |
  | -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
  | `invalid_credentials`                  | "That email and password don't match." (or "username") | "Check them and try again." plus " N attempts left before a 15-minute lock." **only when `attemptsLeft` is known** |
  | `locked`                               | "Your account is locked for 15 minutes."               | "Too many tries. Wait, then try again, or reset your password."                                                    |
  | `rate_limited`                         | "Too many tries right now."                            | "Wait a minute, then try again."                                                                                   |
  | `unavailable`, or any unexpected error | "We can't reach MHAI right now."                       | "Check your connection and try again in a moment."                                                                 |

  Under the banner, show the links "Reset your password" (if
  `passwordReset`) and "Use hospital account instead" (if `sso`).

- **Empty fields** show inline errors and send nothing: "Enter your work
  email." (or "Enter your username.") and "Enter your password."

- [ ] **Step 1: Write the failing tests**

`components/auth/sign-in-form.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient } from "@/lib/auth/mock";
import { AuthError, type AuthClient } from "@/lib/auth/types";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { GuestGate } from "./guest-gate";
import { SignInForm } from "./sign-in-form";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

const page = (client: AuthClient = createMockAuthClient()) =>
  renderWithAuth(
    <GuestGate>
      <SignInForm />
    </GuestGate>,
    null,
    client,
  );
async function signIn(login: string, password: string) {
  const user = userEvent.setup();
  if (login) await user.type(screen.getByLabelText("Work email"), login);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(
    screen.getByRole("button", { name: "Sign in", exact: true }),
  );
}

describe("SignInForm", () => {
  it("signs a clinician in and goes home", async () => {
    page();
    await signIn("a.reyes@havanahospital.org", "pw");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("goes to the code step when two-step is on", async () => {
    page();
    await signIn("mfa@h.org", "pw");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in/code"));
  });

  it("says what's missing and sends nothing", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "signIn");
    page(client);
    await signIn("", "");
    expect(screen.getByText("Enter your work email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("explains a wrong password with the attempts left", async () => {
    page();
    await signIn("x@h.org", "wrong");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email and password don't match.");
    expect(alert).toHaveTextContent("4 attempts left before a 15-minute lock.");
    expect(
      screen.getByRole("link", { name: "Reset your password" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("never guesses attempts the backend didn't send", async () => {
    const client = createMockAuthClient();
    vi.spyOn(client, "signIn").mockRejectedValue(
      new AuthError("invalid_credentials"),
    );
    page(client);
    await signIn("x@h.org", "pw");
    expect(await screen.findByRole("alert")).not.toHaveTextContent(
      /attempts? left/,
    );
  });

  it("tells a locked account to wait", async () => {
    page();
    await signIn("locked@h.org", "pw");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your account is locked for 15 minutes.",
    );
  });

  it("blames the connection, not the password, when the API is down", async () => {
    const client = createMockAuthClient();
    vi.spyOn(client, "signIn").mockRejectedValue(new TypeError("fetch failed"));
    page(client);
    await signIn("x@h.org", "pw");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We can't reach MHAI right now.");
    expect(alert).not.toHaveTextContent(/match/);
  });

  it("hides what the backend can't do", () => {
    const client = createMockAuthClient();
    Object.assign(client, {
      capabilities: {
        sso: false,
        emailLogin: false,
        passwordReset: false,
        devices: false,
        trustDevice: false,
      },
    });
    page(client);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /hospital account/ }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Forgot?" })).toBeNull();
  });

  it("signs in with the hospital account in the demo", async () => {
    page();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with hospital account" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/auth/sign-in-form.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the layout, the gate and the demo hint**

`components/auth/auth-layout.tsx`:

```tsx
import { BadgeCheck, ShieldCheck, Target } from "lucide-react";
import type { ReactNode } from "react";
import { Logo, PartnerLine } from "../ui/brand";

const TRUST = [
  { Icon: ShieldCheck, text: "Patient details are masked before any analysis" },
  {
    Icon: BadgeCheck,
    text: "Every claim is checked against clinical guidelines",
  },
  {
    Icon: Target,
    text: "You stay in control: the final decision is always yours",
  },
];

/** Sign-in screens: the brand panel (desktop) and the form column. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-[calc(100dvh-var(--demo-h,0px))] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section
        aria-label="About MHAI"
        className="hidden flex-col justify-between gap-10 bg-gradient-to-br from-bloom to-[#2a0f33] p-12 text-white print:hidden lg:flex"
      >
        <Logo className="h-11 w-auto self-start brightness-0 invert" />
        <div>
          <h2 className="max-w-[480px] font-display text-[52px] font-black leading-[.95]">
            Better, quicker answers at the bedside.
          </h2>
          <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-white/80">
            Evidence-checked clinical decision support for every clinic,
            including the most resource-limited.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-[14px]">
            {TRUST.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-white/15">
                  <Icon aria-hidden className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="self-start rounded-2xl bg-white/95 px-4 py-2.5">
          <PartnerLine />
        </div>
      </section>
      <div className="flex flex-col items-center justify-center px-5 py-10">
        <Logo className="mb-8 h-10 w-auto print:hidden lg:hidden" />
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </main>
  );
}

export function AuthHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {eyebrow && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-[40px] font-black leading-none">
        {title}
      </h1>
      {sub && <p className="mt-2 text-[14.5px] text-ink-2">{sub}</p>}
    </header>
  );
}
```

`components/auth/guest-gate.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";

/** Pages for signed-out people; anyone signed in goes where they belong. */
export function GuestGate({ children }: { children: ReactNode }) {
  const { status, user, steps } = useAuth();
  const router = useRouter();
  const target = status === "signed_in" ? homeFor({ user, steps }) : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (status === "loading" || target) return null;
  return children;
}
```

`components/auth/demo-hint.tsx`:

```tsx
/** How testers reach each sign-in state in the demo. Mock mode only. */
export function DemoHint() {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") return null;
  return (
    <aside
      aria-label="Demo sign-in"
      className="mt-6 rounded-2xl border border-dashed border-lilac-2 bg-lilac/40 p-4 text-[12.5px] leading-relaxed text-ink-2"
    >
      <b className="block text-ink">Demo sign-in</b>
      Any email and password works. The two-step code is{" "}
      <code className="font-mono">123456</code>. To see other screens, start the
      email with <code className="font-mono">mfa</code>,{" "}
      <code className="font-mono">new</code>,{" "}
      <code className="font-mono">admin</code> or{" "}
      <code className="font-mono">locked</code>, or use the password{" "}
      <code className="font-mono">wrong</code>.
    </aside>
  );
}
```

- [ ] **Step 4: Write the form**

`components/auth/sign-in-form.tsx`:

```tsx
"use client";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError, type AuthErrorCode } from "@/lib/auth/types";
import { SignedOutNotice } from "../states/signed-out-notice";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { DemoHint } from "./demo-hint";
import { inputClass } from "./password-fields";

/** Shared wording for sign-in and code errors. */
export function authErrorCopy(
  code: AuthErrorCode,
  {
    noun = "email",
    attemptsLeft,
  }: { noun?: string; attemptsLeft?: number } = {},
): { title: string; body: string } {
  switch (code) {
    case "invalid_credentials":
      return {
        title: `That ${noun} and password don't match.`,
        body:
          "Check them and try again." +
          (attemptsLeft !== undefined
            ? ` ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left before a 15-minute lock.`
            : ""),
      };
    case "locked":
      return {
        title: "Your account is locked for 15 minutes.",
        body: "Too many tries. Wait, then try again, or reset your password.",
      };
    case "rate_limited":
      return {
        title: "Too many tries right now.",
        body: "Wait a minute, then try again.",
      };
    case "mfa_invalid":
      return {
        title: "That code didn't work.",
        body: "Check your authenticator app and try the newest code.",
      };
    case "mfa_expired":
      return {
        title: "That took too long.",
        body: "For your security, sign in again to get a new code.",
      };
    default:
      return {
        title: "We can't reach MHAI right now.",
        body: "Check your connection and try again in a moment.",
      };
  }
}

export const errorCode = (e: unknown): AuthError =>
  e instanceof AuthError ? e : new AuthError("unavailable");

export function SignInForm() {
  const auth = useAuth();
  const { capabilities: can } = auth;
  const router = useRouter();
  const id = useId();
  const noun = can.emailLogin ? "email" : "username";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState({ login: false, password: false });
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const run = async (attempt: () => ReturnType<typeof auth.signIn>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await attempt();
      if (r.status === "mfa_required") router.push("/sign-in/code");
      // Signed in: GuestGate sends them where they belong.
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = { login: !login.trim(), password: !password };
    setMissing(m);
    if (m.login) return loginRef.current?.focus();
    if (m.password) return passwordRef.current?.focus();
    void run(() => auth.signIn(login.trim(), password));
  };

  const copy = error
    ? authErrorCopy(error.code, { noun, attemptsLeft: error.attemptsLeft })
    : null;

  return (
    <>
      <SignedOutNotice />
      <AuthHeading title="Welcome back" sub="Sign in to continue to MHAI." />
      {copy && (
        <div className="mb-4">
          <Banner tone="bad" title={copy.title}>
            <p>{copy.body}</p>
            <p className="mt-1.5 flex flex-wrap gap-x-3">
              {can.passwordReset && (
                <Link
                  className="font-semibold underline"
                  href="/forgot-password"
                >
                  Reset your password
                </Link>
              )}
              {can.sso && (
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => void run(auth.signInWithHospital)}
                >
                  Use hospital account instead
                </button>
              )}
            </p>
          </Banner>
        </div>
      )}
      {can.sso && (
        <>
          <Button
            variant="soft"
            className="w-full"
            disabled={busy}
            onClick={() => void run(auth.signInWithHospital)}
          >
            <Building2 aria-hidden className="size-4" />
            Continue with hospital account
          </Button>
          <p className="my-5 flex items-center gap-3 text-[12px] text-ink-3">
            <span aria-hidden className="h-px flex-1 bg-line" />
            or use {noun}
            <span aria-hidden className="h-px flex-1 bg-line" />
          </p>
        </>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <label
            htmlFor={`${id}-login`}
            className="mb-1.5 block text-[13px] font-semibold"
          >
            {can.emailLogin ? "Work email" : "Username"}
          </label>
          <input
            ref={loginRef}
            id={`${id}-login`}
            type={can.emailLogin ? "email" : "text"}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            aria-invalid={missing.login || undefined}
            aria-describedby={missing.login ? `${id}-login-err` : undefined}
            className={inputClass}
          />
          {missing.login && (
            <p id={`${id}-login-err`} className="mt-1 text-[13px] text-bad">
              {can.emailLogin
                ? "Enter your work email."
                : "Enter your username."}
            </p>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`${id}-pw`} className="text-[13px] font-semibold">
              Password
            </label>
            {can.passwordReset && (
              <Link
                href="/forgot-password"
                className="text-[13px] text-mint-deep"
              >
                Forgot?
              </Link>
            )}
          </div>
          <input
            ref={passwordRef}
            id={`${id}-pw`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={missing.password || undefined}
            aria-describedby={missing.password ? `${id}-pw-err` : undefined}
            className={inputClass}
          />
          {missing.password && (
            <p id={`${id}-pw-err`} className="mt-1 text-[13px] text-bad">
              Enter your password.
            </p>
          )}
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-[13px] text-ink-3">
        Access is for registered clinicians. New here? Ask your hospital admin.
      </p>
      <DemoHint />
    </>
  );
}
```

The submit button's accessible name changes to "Signing in…" while busy,
which is why the tests use `exact: true` on "Sign in".

- [ ] **Step 5: Add the routes**

`app/(auth)/layout.tsx`:

```tsx
import { AuthLayout } from "@/components/auth/auth-layout";

export default function AuthRoutesLayout({ children }: LayoutProps<"/">) {
  return <AuthLayout>{children}</AuthLayout>;
}
```

`app/(auth)/sign-in/page.tsx`:

```tsx
import type { Metadata } from "next";
import { GuestGate } from "@/components/auth/guest-gate";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in · MHAI" };

export default function SignInPage() {
  return (
    <GuestGate>
      <SignInForm />
    </GuestGate>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run components/auth`
Expected: PASS.

Run: `npx playwright test`
Expected: all clinical-flow tests PASS, now signing in first (Task 3
Step 8).

- [ ] **Step 7: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Add the sign-in page with generic errors and the demo hint"
```

---

### Task 5: Two-step code

**Files:**

- Create:
  - `components/auth/code-input.tsx`
  - `components/auth/code-input.test.tsx`
  - `components/auth/code-form.tsx`
  - `components/auth/code-form.test.tsx`
  - `app/(auth)/sign-in/code/page.tsx`

**Interfaces:**

- Consumes: `useAuth` (`mfaPending`, `verifyCode`, `cancelMfa`,
  `capabilities.trustDevice`), `homeFor` (Task 3); `authErrorCopy`,
  `errorCode`, `AuthHeading` (Task 4).
- Produces:
  - `normalizeCode(s: string): string`, which keeps digits only and the
    first six;
  - `CodeInput({ value, onChange, label, disabled?, invalid?,
focusKey? })`, six boxes;
  - `CodeForm`.

**Behaviour (design `account.html` 2):**

- **Copy:** the eyebrow "Two-step verification", the heading "Enter your
  code", and "Open your authenticator app and enter the 6-digit code for
  MHAI."
- **Typing:**
  - a digit fills a box and advances;
  - Backspace on an empty box moves back;
  - ← and → move between boxes;
  - pasting anywhere fills from the first box, digits only, the first six.
- **Box labels:** "Digit 1 of 6" and so on. The first box has
  `autocomplete="one-time-code"`, and all have `inputmode="numeric"`.
- **Verify** stays disabled until there are six digits. Enter submits.
- **"Trust this device for 30 days"** shows only when `trustDevice` is
  supported.
- **"Lost your phone? Use a backup code"** switches to one text field,
  "Backup code", formatted `XXXX-XXXX`. "Use your app instead" switches
  back.
- **"Back to sign in"** cancels the pending step and goes to `/sign-in`.
- **No pending step** (a reload or deep link): go to `/sign-in` if signed
  out, or to `homeFor(...)` if signed in.
- **Errors:**
  - `mfa_invalid` clears the boxes and focuses the first;
  - `mfa_expired` shows its copy and a "Sign in again" link;
  - other errors use `authErrorCopy`.

- [ ] **Step 1: Write the failing tests**

`components/auth/code-input.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CodeInput, normalizeCode } from "./code-input";

function Harness() {
  const [v, setV] = useState("");
  return (
    <>
      <CodeInput value={v} onChange={setV} label="Code from your app" />
      <output data-testid="v">{v}</output>
    </>
  );
}
const box = (n: number) => screen.getByLabelText(`Digit ${n} of 6`);

describe("normalizeCode", () => {
  it.each([
    ["123 456", "123456"],
    ["123-456", "123456"],
    ["1234567", "123456"],
    ["12a3b4", "1234"],
    ["", ""],
  ])("%s → %s", (a, b) => expect(normalizeCode(a)).toBe(b));
});

describe("CodeInput", () => {
  it("advances as you type and backs up on Backspace", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(box(1));
    await user.keyboard("482");
    expect(screen.getByTestId("v")).toHaveTextContent("482");
    expect(box(4)).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(box(3)).toHaveFocus();
  });
  it("fills from a messy paste, first six digits only", () => {
    render(<Harness />);
    fireEvent.paste(box(3), {
      clipboardData: { getData: () => "12 34-56 7" },
    });
    expect(screen.getByTestId("v")).toHaveTextContent("123456");
  });
  it("ignores letters", async () => {
    render(<Harness />);
    await userEvent.type(box(1), "a");
    expect(screen.getByTestId("v")).toHaveTextContent("");
  });
  it("is a labelled group with one-time-code autocomplete", () => {
    render(<Harness />);
    expect(
      screen.getByRole("group", { name: "Code from your app" }),
    ).toBeInTheDocument();
    expect(box(1)).toHaveAttribute("autocomplete", "one-time-code");
    expect(box(2)).toHaveAttribute("inputmode", "numeric");
  });
});
```

`components/auth/code-form.test.tsx`:

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { createMockAuthClient, MOCK_BACKUP_CODES } from "@/lib/auth/mock";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { CodeForm } from "./code-form";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

let auth: ReturnType<typeof useAuth>;
function Grab() {
  auth = useAuth();
  return null;
}
async function pending() {
  renderWithAuth(
    <>
      <Grab />
      <CodeForm />
    </>,
    null,
  );
  await act(() => auth.signIn("mfa@h.org", "pw"));
}

describe("CodeForm", () => {
  it("verifies a six-digit code and goes home", async () => {
    await pending();
    const verify = screen.getByRole("button", { name: "Verify" });
    expect(verify).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    expect(verify).toBeEnabled();
    await userEvent.click(verify);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("clears the boxes after a wrong code", async () => {
    await pending();
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code didn't work.",
    );
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveFocus();
  });

  it("accepts a backup code instead", async () => {
    await pending();
    await userEvent.click(
      screen.getByRole("button", { name: "Use a backup code" }),
    );
    await userEvent.type(
      screen.getByLabelText("Backup code"),
      MOCK_BACKUP_CODES[1]!,
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("offers to trust the device only when supported", async () => {
    await pending();
    expect(
      screen.getByLabelText("Trust this device for 30 days"),
    ).toBeInTheDocument();
  });

  it("sends a deep link with nothing pending back to sign-in", async () => {
    renderWithAuth(<CodeForm />, null, createMockAuthClient());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("goes back to sign-in on request", async () => {
    await pending();
    await userEvent.click(
      screen.getByRole("button", { name: "Back to sign in" }),
    );
    expect(auth.mfaPending).toBe(false);
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/auth/code-input.test.tsx components/auth/code-form.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the code input**

`components/auth/code-input.tsx`:

```tsx
"use client";
import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "../ui/cn";

export const normalizeCode = (s: string) => s.replace(/\D/g, "").slice(0, 6);

/** Six boxes: auto-advance, Backspace goes back, paste fills (design 2). */
export function CodeInput({
  value,
  onChange,
  label,
  disabled,
  invalid,
  focusKey,
}: {
  value: string;
  onChange(v: string): void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Each new value focuses the first box (e.g. after a wrong code). */
  focusKey?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) =>
    refs.current[Math.max(0, Math.min(5, i))]?.focus();
  useEffect(() => {
    if (focusKey) refs.current[0]?.focus();
  }, [focusKey]);

  const setAt = (i: number, digit: string) => {
    const chars = value.padEnd(6, " ").split("");
    chars[i] = digit || " ";
    onChange(normalizeCode(chars.join("").replace(/ /g, "")));
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i]) {
      e.preventDefault();
      setAt(i - 1, "");
      focus(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const code = normalizeCode(e.clipboardData.getData("text"));
    onChange(code);
    focus(code.length);
  };

  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Digit ${i + 1} of 6`}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            const d = raw.replace(/\D/g, "").slice(-1);
            if (!raw) return setAt(i, ""); // Backspace on a filled box
            if (!d) return; // letters are ignored
            setAt(i, d);
            focus(i + 1);
          }}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          className={cn(
            "size-12 rounded-xl border border-line bg-white text-center font-mono text-[22px] font-semibold",
            "focus-visible:outline-2 focus-visible:outline-mint-deep aria-invalid:border-bad",
          )}
        />
      ))}
    </div>
  );
}
```

Typing into box 4 while boxes 1–3 are empty must not skip ahead:
`setAt` drops the gaps, so the digit lands at the end of what's filled.
That keeps the value a plain prefix of digits.

- [ ] **Step 4: Write the form and the route**

`components/auth/code-form.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { CodeInput, normalizeCode } from "./code-input";
import { inputClass } from "./password-fields";
import { authErrorCopy, errorCode } from "./sign-in-form";

const normalizeBackup = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9-]/g, "");

export function CodeForm() {
  const auth = useAuth();
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const backupRef = useRef<HTMLInputElement>(null);

  const target =
    auth.status === "signed_in"
      ? homeFor(auth)
      : auth.status === "signed_out" && !auth.mfaPending
        ? "/sign-in"
        : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (auth.status === "loading" || target) return null;

  const ready = backup
    ? code.replace(/-/g, "").length === 8
    : code.length === 6;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.verifyCode(code, { backup, trustDevice: trust });
    } catch (err) {
      const ae = errorCode(err);
      setError(ae);
      if (ae.code === "mfa_invalid") {
        setCode("");
        if (backup) backupRef.current?.focus();
        else setFocusKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  };
  const copy = error
    ? error.code === "mfa_invalid" && backup
      ? {
          title: "That backup code didn't work.",
          body: "Check it, or it may have been used already. Each code works once.",
        }
      : authErrorCopy(error.code)
    : null;

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow="Two-step verification"
        title="Enter your code"
        sub={
          backup
            ? "Enter one of the backup codes you saved when you set up two-step verification."
            : "Open your authenticator app and enter the 6-digit code for MHAI."
        }
      />
      {copy && (
        <div className="mb-4">
          <Banner tone="bad" title={copy.title}>
            <p>{copy.body}</p>
            {error?.code === "mfa_expired" && (
              <Link
                className="mt-1.5 inline-block font-semibold underline"
                href="/sign-in"
              >
                Sign in again
              </Link>
            )}
          </Banner>
        </div>
      )}
      {backup ? (
        <div>
          <label
            htmlFor={`${id}-backup`}
            className="mb-1.5 block text-[13px] font-semibold"
          >
            Backup code
          </label>
          <input
            ref={backupRef}
            id={`${id}-backup`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(normalizeBackup(e.target.value))}
            className={`${inputClass} font-mono`}
          />
        </div>
      ) : (
        <CodeInput
          value={code}
          onChange={(v) => setCode(normalizeCode(v))}
          label="Code from your app"
          disabled={busy}
          invalid={error?.code === "mfa_invalid"}
          focusKey={focusKey}
        />
      )}
      {auth.capabilities.trustDevice && (
        <label className="mt-4 flex min-h-11 items-center gap-2.5 text-[13.5px]">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="size-4 accent-mint-deep"
          />
          Trust this device for 30 days
        </label>
      )}
      <Button type="submit" className="mt-4 w-full" disabled={!ready || busy}>
        {busy ? "Checking…" : "Verify"}
      </Button>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-ink-3">
        {backup ? (
          <button
            type="button"
            className="min-h-11 text-mint-deep"
            onClick={() => {
              setBackup(false);
              setCode("");
              setError(null);
            }}
          >
            Use your app instead
          </button>
        ) : (
          <>
            Lost your phone?
            <button
              type="button"
              className="min-h-11 text-mint-deep"
              onClick={() => {
                setBackup(true);
                setCode("");
                setError(null);
              }}
            >
              Use a backup code
            </button>
          </>
        )}
        <span aria-hidden>·</span>
        <button
          type="button"
          className="min-h-11 text-mint-deep"
          onClick={() => {
            auth.cancelMfa();
            router.replace("/sign-in");
          }}
        >
          Back to sign in
        </button>
      </p>
    </form>
  );
}
```

`app/(auth)/sign-in/code/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CodeForm } from "@/components/auth/code-form";

export const metadata: Metadata = { title: "Enter your code · MHAI" };

export default function CodePage() {
  return <CodeForm />;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run components/auth`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Add the two-step code step with paste, backup codes and trust"
```

---

### Task 6: First sign-in (terms, password, two-step setup, backup codes)

**Files:**

- Create:
  - `components/auth/qr-code.tsx`
  - `components/auth/backup-codes.tsx`
  - `components/auth/mfa-setup.tsx`
  - `components/auth/terms-step.tsx`
  - `components/auth/new-password-step.tsx`
  - `components/auth/welcome-flow.tsx`
  - `components/auth/welcome-flow.test.tsx`
  - `components/auth/backup-codes.test.tsx`
  - `app/(auth)/welcome/page.tsx`
- Modify: `package.json` and `package-lock.json`, adding `qrcode` and
  `@types/qrcode`.

**Interfaces:**

- Consumes: `useAuth` (`steps`, `completeStep`, `updateUser`, `client`,
  `signOut`), `homeFor` (Task 3); `CodeInput`, `normalizeCode` (Task 5);
  `PasswordFields`, `passwordError` (Task 2); `AuthHeading`,
  `authErrorCopy`, `errorCode` (Task 4); `useToast` (Plan 1).
- Produces:
  - `QrCode({ text, label })`;
  - `BackupCodes({ codes, onFinish, finishLabel? })`;
  - `MfaSetup({ onDone, eyebrow? })`, reused by the account page in
    Task 9;
  - `WelcomeFlow`.

**Behaviour (design `account-flows.html` 7a–7c):**

- **Order:** `terms` → `password` → `mfa`. The MFA step has two phases:
  set up, then the backup codes.
- **Eyebrow:** "Step n of N · …", where N counts the backup codes as a
  step. The labels are:
  - terms: "First sign-in";
  - password: "Your password";
  - set up: "Protect your account";
  - codes: "Just in case".

  The plan of steps is fixed at mount, so "n of N" doesn't jump.

- **Terms:**
  - heading "Before you start", with "Please read and confirm. This takes
    30 seconds.";
  - four points, each a bold lead and plain text:
    - **Decision support, not a decision.** You remain responsible for
      every clinical action.
    - **Check flagged items.** Amber and red results need your review
      before acting.
    - **Patient privacy.** Don't enter names, phone numbers or ID
      numbers. Details are masked, but entering less is safer.
    - **Feedback helps.** Your agreements and corrections improve the
      system.
  - the checkbox "I understand and agree to use MHAI this way";
  - "Continue", disabled until ticked. It calls `client.acceptTerms()`.
- **Password:**
  - heading "Choose a new password", with "Your hospital gave you a
    temporary password. Choose your own to continue.";
  - `PasswordFields` with the identity `user.email ?? user.username`;
  - "Save password" calls `client.changePassword(null, next)`;
  - a `weak_password` reply shows "Choose a stronger password" / "That
    one is too common or has appeared in a leak. Try another.".
- **Two-step setup:**
  - heading "Set up two-step verification", with "Required for everyone.
    It protects patient data if your password is ever leaked.";
  - three numbered lines: "Open Google Authenticator, Microsoft
    Authenticator or similar", "Scan this code", "Enter the 6-digit code
    below";
  - the QR code, then "Can't scan? Show key", which reveals the secret in
    groups of 4 in monospace;
  - `CodeInput` labelled "Code from your app";
  - "Verify and continue" calls `confirmMfaSetup`, then
    `updateUser({ mfaEnabled: true })`.
  - The setup call runs once through TanStack Query (key `["mfa-setup"]`,
    `retry: false`, `staleTime: Infinity`, `gcTime: 0`), so StrictMode
    doesn't enrol twice. It stays memory-only and is cleared on sign-out.
- **Backup codes:**
  - heading "Save your backup codes", with "Each code works once if you
    lose your phone. Keep them somewhere safe, not on a sticky note on the
    ward PC.";
  - a monospace grid of the codes;
  - "Download .txt" (a Blob, `mhai-backup-codes.txt`), "Print"
    (`window.print()`) and "Copy". A "Copied" toast appears only if the
    clipboard write succeeded; otherwise "Couldn't copy. Select the codes
    and copy them yourself.";
  - the checkbox "I've saved these codes somewhere safe", then "Finish
    setup".
- **Routing:** a signed-out visitor goes to `/sign-in`. A signed-in
  person with no steps left goes to `homeFor(...)`, which is also how the
  flow ends.
- **`session_expired`** from any step calls `signOut("expired")`.

- [ ] **Step 1: Install the QR library**

Run: `npm install -E qrcode && npm install -E -D @types/qrcode`
Expected: both added with exact versions.

- [ ] **Step 2: Write the failing tests**

`components/auth/backup-codes.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_BACKUP_CODES } from "@/lib/auth/mock";
import { ToastProvider } from "../ui/toast";
import { BackupCodes } from "./backup-codes";

afterEach(() => vi.restoreAllMocks());
const mount = (onFinish = vi.fn()) =>
  render(
    <ToastProvider>
      <BackupCodes codes={MOCK_BACKUP_CODES} onFinish={onFinish} />
    </ToastProvider>,
  );

describe("BackupCodes", () => {
  it("shows every code and finishes only once saved", async () => {
    const onFinish = vi.fn();
    mount(onFinish);
    for (const c of MOCK_BACKUP_CODES)
      expect(screen.getByText(c)).toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Finish setup" });
    expect(finish).toBeDisabled();
    await userEvent.click(
      screen.getByLabelText("I've saved these codes somewhere safe"),
    );
    await userEvent.click(finish);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("says Copied only when the clipboard write worked", async () => {
    const user = userEvent.setup();
    mount();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
    expect(screen.queryByText("Copied")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });

  it("downloads the codes as a text file", async () => {
    const create = vi.fn(() => "blob:codes");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:codes");
  });
});
```

`components/auth/welcome-flow.test.tsx`:

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { createMockAuthClient } from "@/lib/auth/mock";
import { FROM_CLIENT, renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";
import { WelcomeFlow } from "./welcome-flow";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

let auth: ReturnType<typeof useAuth>;
function Grab() {
  auth = useAuth();
  return null;
}

describe("WelcomeFlow", () => {
  it("walks a new account through all four steps, then home", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("new.nurse@havanahospital.org", "temp"));

    expect(screen.getByText("Step 1 of 4 · First sign-in")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toBeDisabled();
    await user.click(
      screen.getByLabelText("I understand and agree to use MHAI this way"),
    );
    await user.click(go);

    expect(
      await screen.findByText("Step 2 of 4 · Your password"),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "tram-lantern-okra");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));

    expect(
      await screen.findByText("Step 3 of 4 · Protect your account"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /QR code/ }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Can't scan? Show key" }),
    );
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");
    await user.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );

    expect(
      await screen.findByText("Step 4 of 4 · Just in case"),
    ).toBeInTheDocument();
    expect(auth.user?.mfaEnabled).toBe(true);
    await user.click(
      screen.getByLabelText("I've saved these codes somewhere safe"),
    );
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("rejects a wrong setup code and lets you try again", async () => {
    const user = userEvent.setup();
    const client = createMockAuthClient();
    await client.signIn("new@h.org", "temp");
    await client.acceptTerms();
    await client.changePassword(null, "tram-lantern-okra");
    renderWithAuth(
      <ToastProvider>
        <WelcomeFlow />
      </ToastProvider>,
      FROM_CLIENT,
      client,
    );
    expect(
      await screen.findByText("Step 1 of 2 · Protect your account"),
    ).toBeInTheDocument();
    await user.click(await screen.findByLabelText("Digit 1 of 6"));
    await user.keyboard("000000");
    await user.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code didn't work.",
    );
  });

  it("sends a signed-out visitor to sign in", async () => {
    renderWithAuth(<WelcomeFlow />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("sends someone with nothing left to do home", async () => {
    renderWithAuth(<WelcomeFlow />, TEST_USER);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
```

The second test loads the session from the client (`FROM_CLIENT`). Its
plan of steps is `["mfa"]` plus the codes phase, so N is 2.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run components/auth/backup-codes.test.tsx components/auth/welcome-flow.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 4: Write the QR code and backup codes**

`components/auth/qr-code.tsx`:

```tsx
"use client";
import QRCode from "qrcode";
import { useMemo } from "react";

/** An SVG QR code drawn from the matrix: no canvas, no network, no innerHTML. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, d } = useMemo(() => {
    const m = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    let path = "";
    for (let r = 0; r < m.size; r++)
      for (let c = 0; c < m.size; c++)
        if (m.get(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { size: m.size + 8, d: path };
  }, [text]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-44 rounded-xl bg-white text-ink ring-1 ring-line"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
```

`components/auth/backup-codes.tsx`:

```tsx
"use client";
import { Copy, Download, Printer } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { AuthHeading } from "./auth-layout";

export function BackupCodes({
  codes,
  onFinish,
  finishLabel = "Finish setup",
  eyebrow,
}: {
  codes: string[];
  onFinish(): void;
  finishLabel?: string;
  eyebrow?: string;
}) {
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const id = useId();
  const text = `MHAI backup codes\nEach code works once.\n\n${codes.join("\n")}\n`;

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mhai-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ title: "Copied", ms: 1800 });
    } catch {
      toast.show({
        title: "Couldn't copy. Select the codes and copy them yourself.",
        ms: 3000,
      });
    }
  };

  return (
    <div>
      <AuthHeading
        eyebrow={eyebrow}
        title="Save your backup codes"
        sub="Each code works once if you lose your phone. Keep them somewhere safe, not on a sticky note on the ward PC."
      />
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-2 rounded-2xl bg-bg p-4 font-mono text-[15px] tracking-wider"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={download}>
          <Download aria-hidden className="size-4" /> Download .txt
        </Button>
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden className="size-4" /> Print
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          <Copy aria-hidden className="size-4" /> Copy
        </Button>
      </div>
      <label
        htmlFor={id}
        className="mt-5 flex min-h-11 items-center gap-2.5 text-[13.5px] print:hidden"
      >
        <input
          id={id}
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-mint-deep"
        />
        I&apos;ve saved these codes somewhere safe
      </label>
      <Button
        className="mt-3 w-full print:hidden"
        disabled={!saved}
        onClick={onFinish}
      >
        {finishLabel}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Write the two-step setup**

`components/auth/mfa-setup.tsx`:

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { BackupCodes } from "./backup-codes";
import { CodeInput, normalizeCode } from "./code-input";
import { QrCode } from "./qr-code";
import { authErrorCopy, errorCode } from "./sign-in-form";

export type MfaPhase = "setup" | "codes";
const grouped = (s: string) => s.match(/.{1,4}/g)?.join(" ") ?? s;

/** Enrol an authenticator app, then show the backup codes once (7b, 7c). */
export function MfaSetup({
  onDone,
  eyebrow,
}: {
  onDone(): void;
  /** Eyebrow per phase, e.g. "Step 3 of 4 · Protect your account". */
  eyebrow?: (p: MfaPhase) => string | undefined;
}) {
  const { client, updateUser, signOut } = useAuth();
  const setup = useQuery({
    queryKey: ["mfa-setup"],
    queryFn: () => client.startMfaSetup(),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [phase, setPhase] = useState<MfaPhase>("setup");
  const [code, setCode] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState(0);

  if (phase === "codes" && setup.data)
    return (
      <BackupCodes
        eyebrow={eyebrow?.("codes")}
        codes={setup.data.backupCodes}
        onFinish={onDone}
      />
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.confirmMfaSetup(code);
      updateUser({ mfaEnabled: true });
      setPhase("codes");
    } catch (err) {
      const ae = errorCode(err);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
      setCode("");
      setFocusKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  const copy = error ? authErrorCopy(error.code) : null;

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow={eyebrow?.("setup")}
        title="Set up two-step verification"
        sub="Required for everyone. It protects patient data if your password is ever leaked."
      />
      {copy && (
        <div className="mb-4">
          <Banner tone="bad" title={copy.title}>
            <p>{copy.body}</p>
          </Banner>
        </div>
      )}
      {setup.isError && (
        <div className="mb-4">
          <Banner tone="bad" title="We couldn't start the setup.">
            <p>Check your connection and try again.</p>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => void setup.refetch()}
            >
              Try again
            </Button>
          </Banner>
        </div>
      )}
      <ol className="mb-4 flex list-decimal flex-col gap-1 pl-5 text-[14px] text-ink-2">
        <li>Open Google Authenticator, Microsoft Authenticator or similar</li>
        <li>Scan this code</li>
        <li>Enter the 6-digit code below</li>
      </ol>
      {setup.data && (
        <div className="mb-4 flex flex-col items-start gap-2">
          <QrCode
            text={setup.data.otpauthUri}
            label="QR code for your authenticator app"
          />
          <button
            type="button"
            aria-expanded={showKey}
            className="min-h-11 text-[13px] text-mint-deep"
            onClick={() => setShowKey((v) => !v)}
          >
            Can&apos;t scan? Show key
          </button>
          {showKey && (
            <p className="rounded-xl bg-bg px-3 py-2 font-mono text-[15px] tracking-wider">
              {grouped(setup.data.secret)}
            </p>
          )}
        </div>
      )}
      <CodeInput
        value={code}
        onChange={(v) => setCode(normalizeCode(v))}
        label="Code from your app"
        disabled={busy || !setup.data}
        invalid={error?.code === "mfa_invalid"}
        focusKey={focusKey}
      />
      <Button
        type="submit"
        className="mt-4 w-full"
        disabled={code.length !== 6 || busy || !setup.data}
      >
        {busy ? "Checking…" : "Verify and continue"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Write the terms and password steps, and the flow**

`components/auth/terms-step.tsx`:

```tsx
"use client";
import { useId, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { authErrorCopy, errorCode } from "./sign-in-form";

const POINTS = [
  [
    "Decision support, not a decision.",
    "You remain responsible for every clinical action.",
  ],
  [
    "Check flagged items.",
    "Amber and red results need your review before acting.",
  ],
  [
    "Patient privacy.",
    "Don't enter names, phone numbers or ID numbers. Details are masked, but entering less is safer.",
  ],
  ["Feedback helps.", "Your agreements and corrections improve the system."],
] as const;

export function TermsStep({
  eyebrow,
  onDone,
}: {
  eyebrow: string;
  onDone(): void;
}) {
  const { client, signOut } = useAuth();
  const id = useId();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.acceptTerms();
      onDone();
    } catch (e) {
      const ae = errorCode(e);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
    } finally {
      setBusy(false);
    }
  };
  const copy = error ? authErrorCopy(error.code) : null;
  return (
    <div>
      <AuthHeading
        eyebrow={eyebrow}
        title="Before you start"
        sub="Please read and confirm. This takes 30 seconds."
      />
      {copy && (
        <div className="mb-4">
          <Banner tone="bad" title={copy.title}>
            <p>{copy.body}</p>
          </Banner>
        </div>
      )}
      <ul className="flex flex-col gap-3 text-[14px] leading-normal">
        {POINTS.map(([lead, rest]) => (
          <li key={lead} className="rounded-2xl bg-bg px-4 py-3">
            <b>{lead}</b> {rest}
          </li>
        ))}
      </ul>
      <label
        htmlFor={id}
        className="mt-5 flex min-h-11 items-center gap-2.5 text-[13.5px]"
      >
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="size-4 accent-mint-deep"
        />
        I understand and agree to use MHAI this way
      </label>
      <Button
        className="mt-3 w-full"
        disabled={!agreed || busy}
        onClick={() => void go()}
      >
        Continue
      </Button>
    </div>
  );
}
```

`components/auth/new-password-step.tsx`:

```tsx
"use client";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { passwordError } from "@/lib/auth/password-rules";
import type { AuthError } from "@/lib/auth/types";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { PasswordFields } from "./password-fields";
import { authErrorCopy, errorCode } from "./sign-in-form";

export const WEAK_COPY = {
  title: "Choose a stronger password",
  body: "That one is too common or has appeared in a leak. Try another.",
};

export function NewPasswordStep({
  eyebrow,
  onDone,
}: {
  eyebrow: string;
  onDone(): void;
}) {
  const { client, user, signOut } = useAuth();
  const identity = user?.email ?? user?.username ?? null;
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (passwordError(next, confirm, identity) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.changePassword(null, next);
      onDone();
    } catch (err) {
      const ae = errorCode(err);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
    } finally {
      setBusy(false);
    }
  };
  const copy = error
    ? error.code === "weak_password"
      ? WEAK_COPY
      : authErrorCopy(error.code)
    : null;
  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow={eyebrow}
        title="Choose a new password"
        sub="Your hospital gave you a temporary password. Choose your own to continue."
      />
      {copy && (
        <div className="mb-4">
          <Banner tone="bad" title={copy.title}>
            <p>{copy.body}</p>
          </Banner>
        </div>
      )}
      <PasswordFields
        next={next}
        confirm={confirm}
        onNext={setNext}
        onConfirm={setConfirm}
        identity={identity}
        showErrors={showErrors}
      />
      <Button type="submit" className="mt-4 w-full" disabled={busy}>
        Save password
      </Button>
    </form>
  );
}
```

`components/auth/welcome-flow.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import type { FirstStep } from "@/lib/auth/types";
import { MfaSetup } from "./mfa-setup";
import { NewPasswordStep } from "./new-password-step";
import { TermsStep } from "./terms-step";

type Shown = FirstStep | "codes";
const LABEL: Record<Shown, string> = {
  terms: "First sign-in",
  password: "Your password",
  mfa: "Protect your account",
  codes: "Just in case",
};

export function WelcomeFlow() {
  const auth = useAuth();
  const router = useRouter();
  // The plan is fixed once known, so "Step n of N" doesn't jump.
  const [plan, setPlan] = useState<Shown[] | null>(null);
  if (plan === null && auth.status === "signed_in" && auth.steps.length)
    setPlan(
      auth.steps.flatMap((s): Shown[] =>
        s === "mfa" ? ["mfa", "codes"] : [s],
      ),
    );

  const target =
    auth.status === "signed_out"
      ? "/sign-in"
      : auth.status === "signed_in" && !auth.steps.length
        ? homeFor(auth)
        : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (auth.status === "loading" || target || !plan) return null;

  const current = auth.steps[0]!;
  const eyebrow = (s: Shown) =>
    `Step ${plan.indexOf(s) + 1} of ${plan.length} · ${LABEL[s]}`;

  if (current === "terms")
    return (
      <TermsStep
        eyebrow={eyebrow("terms")}
        onDone={() => auth.completeStep("terms")}
      />
    );
  if (current === "password")
    return (
      <NewPasswordStep
        eyebrow={eyebrow("password")}
        onDone={() => auth.completeStep("password")}
      />
    );
  return (
    <MfaSetup
      eyebrow={(p) => eyebrow(p === "codes" ? "codes" : "mfa")}
      onDone={() => auth.completeStep("mfa")}
    />
  );
}
```

`app/(auth)/welcome/page.tsx`:

```tsx
import type { Metadata } from "next";
import { WelcomeFlow } from "@/components/auth/welcome-flow";

export const metadata: Metadata = { title: "Welcome · MHAI" };

export default function WelcomePage() {
  return <WelcomeFlow />;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run components/auth`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Add first sign-in: terms, new password, two-step setup, backup codes"
```

---

### Task 7: Forgot and reset password

**Files:**

- Create:
  - `components/auth/forgot-password.tsx`
  - `components/auth/reset-password.tsx`
  - `components/auth/password-reset.test.tsx`
  - `app/(auth)/forgot-password/page.tsx`
  - `app/(auth)/reset-password/page.tsx`

**Interfaces:**

- Consumes: `useAuth` (`client`, `capabilities`), `GuestGate`,
  `AuthHeading`, `authErrorCopy`, `errorCode` (Task 4); `PasswordFields`,
  `passwordError` (Task 2); `WEAK_COPY` (Task 6); `inputClass`.
- Produces: `ForgotPassword`, `ResetPassword`.

**Behaviour (design `account-flows.html` 8a–8d):**

- **Reset not supported** (`passwordReset` false): `/forgot-password`
  shows "Reset your password" / "Ask your hospital admin to reset your
  password." and "← Back to sign in".
- **8a, the request form:**
  - "Reset your password", with "Enter your work email and we'll send a
    reset link.";
  - the field "Work email" and the button "Send reset link";
  - an email that isn't well-formed shows "Enter a work email, like
    name@hospital.org." and sends nothing;
  - with `sso`, also "Signing in with your hospital account? Reset it
    with your hospital IT";
  - "← Back to sign in".
- **8b, the confirmation:**
  - "Check your email", with "If an account exists for {email}, a reset
    link is on its way. It expires in 30 minutes.";
  - "Resend link" is disabled with a `m:ss` countdown for 60 seconds,
    then enabled;
  - "Didn't get it? Check spam, or contact your hospital admin";
  - the reply is the same whether or not the account exists;
  - the email lives in React state only, never in the URL.
- **8c, the new password:**
  - `/reset-password?token=…` reads the token once and strips it from the
    address bar with `history.replaceState`;
  - with no token: "This link is missing or incomplete." and a link to
    `/forgot-password`;
  - otherwise "Choose a new password", `PasswordFields` (with identity
    `null`), "Save new password" and "You'll be signed out of all other
    devices.";
  - `link_expired` shows "This link has expired or was already used." /
    "Reset links work once, for 30 minutes." and a link "Send a new
    link".
- **8d, done:** "Password updated", with "You've been signed out
  everywhere else. Sign in with your new password. You'll still need your
  authenticator app.", and a "Back to sign in" link.

- [ ] **Step 1: Write the failing tests**

`components/auth/password-reset.test.tsx`:

```tsx
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient, MOCK_RESET_TOKEN } from "@/lib/auth/mock";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { ForgotPassword } from "./forgot-password";
import { ResetPassword } from "./reset-password";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => search,
}));
beforeEach(() => {
  search = new URLSearchParams();
});
afterEach(() => vi.useRealTimers());

describe("ForgotPassword", () => {
  it("sends the link and shows the same reply for any email", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "requestPasswordReset");
    renderWithAuth(<ForgotPassword />, null, client);
    await userEvent.type(screen.getByLabelText("Work email"), "who@ever.org");
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/If an account exists for/)).toHaveTextContent(
      "who@ever.org",
    );
    expect(spy).toHaveBeenCalledWith("who@ever.org");
    expect(window.location.search).not.toMatch(/who/);
  });

  it("waits 60 seconds before allowing a resend", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithAuth(<ForgotPassword />, null);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText("Work email"), "a@h.org");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    const resend = await screen.findByRole("button", { name: /Resend link/ });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent("1:00");
    act(() => vi.advanceTimersByTime(60_000));
    expect(resend).toBeEnabled();
  });

  it("checks the email looks right before sending", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "requestPasswordReset");
    renderWithAuth(<ForgotPassword />, null, client);
    await userEvent.type(screen.getByLabelText("Work email"), "not-an-email");
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    expect(
      screen.getByText("Enter a work email, like name@hospital.org."),
    ).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("points to the admin when reset isn't supported", () => {
    const client = createMockAuthClient();
    Object.assign(client, {
      capabilities: { ...client.capabilities, passwordReset: false },
    });
    renderWithAuth(<ForgotPassword />, null, client);
    expect(
      screen.getByText("Ask your hospital admin to reset your password."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Work email")).toBeNull();
  });
});

describe("ResetPassword", () => {
  it("strips the token from the address bar, then saves the new password", async () => {
    window.history.replaceState(
      null,
      "",
      `/reset-password?token=${MOCK_RESET_TOKEN}`,
    );
    search = new URLSearchParams({ token: MOCK_RESET_TOKEN });
    renderWithAuth(<ResetPassword />, null);
    expect(window.location.search).toBe("");
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save new password" }),
    );
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    search = new URLSearchParams({ token: "old" });
    renderWithAuth(<ResetPassword />, null);
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save new password" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired or was already used.",
    );
    expect(
      screen.getByRole("link", { name: "Send a new link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("handles a link with no token", () => {
    renderWithAuth(<ResetPassword />, null);
    expect(
      screen.getByText("This link is missing or incomplete."),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/auth/password-reset.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the forgot-password component**

`components/auth/forgot-password.tsx`:

```tsx
"use client";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { inputClass } from "./password-fields";
import { authErrorCopy, errorCode } from "./sign-in-form";

const COOLDOWN_S = 60;
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const mss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const BackToSignIn = () => (
  <p className="mt-6 text-center text-[13px]">
    <Link
      href="/sign-in"
      className="inline-flex min-h-11 items-center text-mint-deep"
    >
      ← Back to sign in
    </Link>
  </p>
);

export function ForgotPassword() {
  const { client, capabilities: can } = useAuth();
  const id = useId();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  if (!can.passwordReset)
    return (
      <>
        <AuthHeading
          title="Reset your password"
          sub="Ask your hospital admin to reset your password."
        />
        <BackToSignIn />
      </>
    );

  const send = async (to: string) => {
    setBusy(true);
    setError(null);
    try {
      await client.requestPasswordReset(to);
      setSentTo(to);
      setLeft(COOLDOWN_S);
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    setInvalid(!looksLikeEmail(to));
    if (looksLikeEmail(to)) void send(to);
  };
  const copy = error ? authErrorCopy(error.code) : null;
  const banner = copy && (
    <div className="mb-4">
      <Banner tone="bad" title={copy.title}>
        <p>{copy.body}</p>
      </Banner>
    </div>
  );

  if (sentTo)
    return (
      <>
        <div
          aria-hidden
          className="mb-4 grid size-14 place-items-center rounded-2xl bg-lilac text-bloom"
        >
          <Mail className="size-6" />
        </div>
        <AuthHeading
          title="Check your email"
          sub={
            <>
              If an account exists for <b>{sentTo}</b>, a reset link is on its
              way. It expires in 30 minutes.
            </>
          }
        />
        {banner}
        <Button
          variant="ghost"
          className="w-full"
          disabled={left > 0 || busy}
          onClick={() => void send(sentTo)}
        >
          Resend link
          {left > 0 && <span className="font-mono tabular">{mss(left)}</span>}
        </Button>
        <p className="mt-4 text-center text-[13px] text-ink-3">
          Didn&apos;t get it? Check spam, or contact your hospital admin.
        </p>
        <BackToSignIn />
      </>
    );

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        title="Reset your password"
        sub="Enter your work email and we'll send a reset link."
      />
      {banner}
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        Work email
      </label>
      <input
        id={id}
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : undefined}
        className={inputClass}
      />
      {invalid && (
        <p id={`${id}-err`} className="mt-1 text-[13px] text-bad">
          Enter a work email, like name@hospital.org.
        </p>
      )}
      <Button type="submit" className="mt-4 w-full" disabled={busy}>
        Send reset link
      </Button>
      {can.sso && (
        <p className="mt-4 text-center text-[13px] text-ink-3">
          Signing in with your hospital account? Reset it with your hospital IT.
        </p>
      )}
      <BackToSignIn />
    </form>
  );
}
```

- [ ] **Step 4: Write the reset-password component and routes**

`components/auth/reset-password.tsx`:

```tsx
"use client";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { passwordError } from "@/lib/auth/password-rules";
import type { AuthError } from "@/lib/auth/types";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { BackToSignIn } from "./forgot-password";
import { WEAK_COPY } from "./new-password-step";
import { PasswordFields } from "./password-fields";
import { authErrorCopy, errorCode } from "./sign-in-form";

export function ResetPassword() {
  const { client } = useAuth();
  const params = useSearchParams();
  // Read once; the address bar is cleaned below.
  const [token] = useState(() => params.get("token"));
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.location.search)
      window.history.replaceState(null, "", "/reset-password");
  }, []);

  if (!token)
    return (
      <>
        <AuthHeading
          title="Reset your password"
          sub="This link is missing or incomplete."
        />
        <Link href="/forgot-password" className="font-semibold text-mint-deep">
          Send a new link
        </Link>
        <BackToSignIn />
      </>
    );

  if (done)
    return (
      <>
        <div
          aria-hidden
          className="mb-4 grid size-14 place-items-center rounded-2xl bg-ok-wash text-ok-deep"
        >
          <CheckCircle2 className="size-6" />
        </div>
        <AuthHeading
          title="Password updated"
          sub="You've been signed out everywhere else. Sign in with your new password. You'll still need your authenticator app."
        />
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-br from-mint to-mint-deep px-5 text-sm font-semibold text-white"
        >
          Back to sign in
        </Link>
      </>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (passwordError(next, confirm, null) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.resetPassword(token, next);
      setDone(true);
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };
  const copy = !error
    ? null
    : error.code === "link_expired"
      ? {
          title: "This link has expired or was already used.",
          body: "Reset links work once, for 30 minutes.",
        }
      : error.code === "weak_password"
        ? WEAK_COPY
        : authErrorCopy(error.code);

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading title="Choose a new password" />
      {copy && (
        <div className="mb-4">
          <Banner tone="bad" title={copy.title}>
            <p>{copy.body}</p>
            {error?.code === "link_expired" && (
              <Link
                href="/forgot-password"
                className="mt-1.5 inline-block font-semibold underline"
              >
                Send a new link
              </Link>
            )}
          </Banner>
        </div>
      )}
      <PasswordFields
        next={next}
        confirm={confirm}
        onNext={setNext}
        onConfirm={setConfirm}
        identity={null}
        showErrors={showErrors}
      />
      <Button type="submit" className="mt-4 w-full" disabled={busy}>
        Save new password
      </Button>
      <p className="mt-3 text-center text-[13px] text-ink-3">
        You&apos;ll be signed out of all other devices.
      </p>
    </form>
  );
}
```

`app/(auth)/forgot-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ForgotPassword } from "@/components/auth/forgot-password";
import { GuestGate } from "@/components/auth/guest-gate";

export const metadata: Metadata = { title: "Reset your password · MHAI" };

export default function ForgotPasswordPage() {
  return (
    <GuestGate>
      <ForgotPassword />
    </GuestGate>
  );
}
```

`app/(auth)/reset-password/page.tsx` (reading search params under
`cacheComponents` needs `<Suspense>`):

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestGate } from "@/components/auth/guest-gate";
import { ResetPassword } from "@/components/auth/reset-password";

export const metadata: Metadata = { title: "Choose a new password · MHAI" };

export default function ResetPasswordPage() {
  return (
    <GuestGate>
      <Suspense fallback={null}>
        <ResetPassword />
      </Suspense>
    </GuestGate>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run components/auth/password-reset.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Add forgot and reset password with a resend cooldown"
```

---

### Task 8: The 403 "wrong app" page

**Files:**

- Create: `components/auth/no-access.tsx`, `components/auth/no-access.test.tsx`, `app/no-access/page.tsx`
- Modify: `.env.example`

**Interfaces:**

- Consumes: `useAuth`, `homeFor` (Task 3).
- Produces: `NoAccess`.

**Behaviour (design `states-and-export.html`, the 403 card):**

- **Content:**
  - a lilac tile with a lock;
  - "You don't have access";
  - "This page is for clinicians. Admin accounts manage the system in the
    admin app.";
  - "Go to admin app", a link to `NEXT_PUBLIC_ADMIN_APP_URL`, shown only
    when that's set;
  - "Sign out" (a manual sign-out);
  - "Error 403".
- **Routing:**
  - a signed-out visitor goes to `/sign-in`;
  - a clinician goes to `homeFor(...)`;
  - only a signed-in non-clinician sees the page.
- **Nothing clinical** is rendered or fetched here. The page sits outside
  the `(clinical)` group.

- [ ] **Step 1: Write the failing test**

`components/auth/no-access.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { NoAccess } from "./no-access";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());
afterEach(() => vi.unstubAllEnvs());
const ADMIN = { ...TEST_USER, role: "admin" as const };

describe("NoAccess", () => {
  it("explains the 403 and offers sign out", async () => {
    renderWithAuth(<NoAccess />, ADMIN);
    expect(
      screen.getByRole("heading", { name: "You don't have access" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Error 403")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to admin app" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
  it("links to the admin app when its address is set", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_APP_URL", "https://admin.example.org");
    renderWithAuth(<NoAccess />, ADMIN);
    expect(
      screen.getByRole("link", { name: "Go to admin app" }),
    ).toHaveAttribute("href", "https://admin.example.org");
  });
  it("sends a clinician home and a visitor to sign in", async () => {
    const { unmount } = renderWithAuth(<NoAccess />, TEST_USER);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    unmount();
    renderWithAuth(<NoAccess />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/auth/no-access.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the page**

`components/auth/no-access.tsx`:

```tsx
"use client";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { Button } from "../ui/button";

export function NoAccess() {
  const auth = useAuth();
  const router = useRouter();
  const target =
    auth.status === "signed_out"
      ? "/sign-in"
      : auth.status === "signed_in" && homeFor(auth) !== "/no-access"
        ? homeFor(auth)
        : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (auth.status === "loading" || target) return null;
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL;
  return (
    <main className="canvas-v3 grid min-h-[calc(100dvh-var(--demo-h,0px))] place-items-center p-6 text-center">
      <div>
        <div
          aria-hidden
          className="mx-auto mb-4 grid size-20 place-items-center rounded-[26px] bg-lilac text-bloom"
        >
          <Lock className="size-8" />
        </div>
        <h1 className="font-display text-[42px] font-black leading-none">
          You don&apos;t have access
        </h1>
        <p className="mx-auto my-3 max-w-[420px] leading-relaxed text-ink-2">
          This page is for clinicians. Admin accounts manage the system in the
          admin app.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {adminUrl && (
            <a
              href={adminUrl}
              className="inline-flex min-h-11 items-center rounded-full bg-mint px-5 font-semibold text-white"
            >
              Go to admin app
            </a>
          )}
          <Button variant="ghost" onClick={() => void auth.signOut("manual")}>
            Sign out
          </Button>
        </div>
        <p className="mt-3.5 font-mono text-xs text-ink-3">Error 403</p>
      </div>
    </main>
  );
}
```

`app/no-access/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/no-access";

export const metadata: Metadata = { title: "No access · MHAI" };

export default function NoAccessPage() {
  return <NoAccess />;
}
```

Append to `.env.example`:

```bash
# Where "Go to admin app" points on the 403 page. Unset hides the button.
# NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.org
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/auth/no-access.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Add the 403 page for accounts that aren't clinicians"
```

---

### Task 9: The account menu, sign-out and the account page

**Files:**

- Create:
  - `components/shell/account-menu.tsx`
  - `components/shell/account-menu.test.tsx`
  - `components/account/account-view.tsx`
  - `components/account/change-password-dialog.tsx`
  - `components/account/devices-section.tsx`
  - `components/account/account-view.test.tsx`
  - `components/auth/sign-out.tsx`
  - `components/auth/sign-out.test.tsx`
  - `app/(clinical)/account/page.tsx`
  - `app/sign-out/page.tsx`
- Modify: `components/shell/app-shell.tsx` (adds `openShortcuts`),
  `components/shell/sidebar.tsx` (the footer becomes `AccountMenu`).

**Interfaces:**

- Consumes:
  - `useAuth` (`user`, `client`, `capabilities`, `signOut`,
    `updateUser`) and `initials` (Tasks 1 and 3);
  - `MfaSetup` (Task 6);
  - `PasswordFields`, `passwordError`, `inputClass` (Task 2);
  - `WEAK_COPY` (Task 6);
  - `authErrorCopy`, `errorCode` (Task 4);
  - `useShell` (`navigate`, plus the new `openShortcuts`);
  - `Dialog`, `Button`, `Banner`, `useToast`, `TopBar`, `MenuButton`
    (Plan 1).
- Produces: `AccountMenu({ rail })`, `AccountView`,
  `ChangePasswordDialog({ open, onClose })`, `DevicesSection`, `SignOut`,
  and `openShortcuts(): void` on the shell context.

**Behaviour (design `account.html` 4 and 5):**

- **Account menu:**
  - The sidebar footer is now a button labelled `Account: {displayName}`
    (avatar, name, role line, hospital, `⋯`; avatar only in the rail). It
    opens a menu above it.
  - The menu has a header (`fullName ?? displayName`, then `email ??
username`) and these items:
    - "Profile & security" → `/account`;
    - "Keyboard shortcuts" → the shell's shortcuts dialog;
    - "Help & guide" → `/help`;
    - "Sign out".
  - Keyboard handling follows Plan 1's export menu: ↑ ↓ Home End move, Esc
    closes and returns focus, and clicking outside closes.
  - "My feedback & corrections" belongs to Plan 3 and isn't shown.
- **Sign out goes through the shell guard:** the menu calls
  `navigate("/sign-out")`. With an open draft, Plan 1's `UnsavedGuard`
  asks first; on Discard it pushes `/sign-out`, which signs out
  (`manual`). Signed-out visitors to `/sign-out` go to `/sign-in`.
- **Account page** (`/account`, inside the shell), with the title
  "Profile & security":
  - **Profile:**
    - the avatar, `fullName ?? displayName`, and `email ?? username`;
    - the rows Role (`roleTitle`), Specialty and Hospital, each with a
      lock and "from hospital records";
    - rows with a `null` value are hidden;
    - "Something wrong? Ask your hospital admin to update it."
  - **Security:** "Protects patient data across every session."
    - **Two-step verification:** "On", or "Off" with "Set up". "Set up"
      opens a dialog with `MfaSetup`; finishing shows the toast
      "Two-step verification is on".
    - **Password:** "Change" opens `ChangePasswordDialog`.
  - **Devices** (only when `capabilities.devices`): "Sign out anything you
    don't recognise."
    - Each row shows the label and `place · active now` (current, with a
      "This device" tag) or `place · N min/h/d ago`.
    - Other devices have a "Sign out" button.
    - "Sign out everywhere" opens a confirm dialog: "Sign out everywhere?"
      / "You'll be signed out on every device, including this one." with
      "Sign out everywhere" and "Cancel". Confirming calls
      `client.signOutEverywhere()`, then `signOut("manual")`.
- **Change password dialog:**
  - the field "Current password", then `PasswordFields`;
  - "Save password" calls `client.changePassword(current, next)`;
  - success closes the dialog with the toast "Password changed";
  - `wrong_password` shows "That isn't your current password." under the
    field;
  - `weak_password` shows `WEAK_COPY`;
  - `session_expired` calls `signOut("expired")`.

- [ ] **Step 1: Write the failing tests**

`components/shell/account-menu.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";

const navigate = vi.fn();
const openShortcuts = vi.fn();
vi.mock("./app-shell", () => ({
  useShell: () => ({ navigate, openShortcuts }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { AccountMenu } from "./account-menu";

beforeEach(() => {
  navigate.mockClear();
  openShortcuts.mockClear();
});

describe("AccountMenu", () => {
  it("shows who is signed in and opens the menu", async () => {
    renderWithAuth(<AccountMenu rail={false} />);
    const button = screen.getByRole("button", { name: "Account: Dr. Reyes" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Havana Hospital")).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText(TEST_USER.email!)).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Profile & security",
      "Keyboard shortcuts",
      "Help & guide",
      "Sign out",
    ]);
    expect(screen.getAllByRole("menuitem")[0]).toHaveFocus();
  });

  it("moves with arrow keys and closes on Esc, returning focus", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AccountMenu rail={false} />);
    const button = screen.getByRole("button", { name: /Account/ });
    await user.click(button);
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("menuitem")[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getAllByRole("menuitem")[3]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("opens shortcuts, and signs out through the shell guard", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AccountMenu rail={false} />);
    await user.click(screen.getByRole("button", { name: /Account/ }));
    await user.click(
      screen.getByRole("menuitem", { name: "Keyboard shortcuts" }),
    );
    expect(openShortcuts).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /Account/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(navigate).toHaveBeenCalledWith("/sign-out");
  });

  it("is absent when nobody is signed in", () => {
    const { container } = renderWithAuth(<AccountMenu rail={false} />, null);
    expect(container).toBeEmptyDOMElement();
  });
});
```

`components/auth/sign-out.test.tsx`:

```tsx
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { SignOut } from "./sign-out";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

describe("SignOut", () => {
  it("signs out and lands on sign-in", async () => {
    renderWithAuth(<SignOut />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it("sends a signed-out visitor to sign-in", async () => {
    renderWithAuth(<SignOut />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});
```

`components/account/account-view.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient } from "@/lib/auth/mock";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";
import { AccountView } from "./account-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/account",
}));
beforeEach(() => replace.mockClear());

async function signedIn(user = TEST_USER) {
  const client = createMockAuthClient();
  await client.signIn(user.email!, "pw");
  renderWithAuth(
    <ToastProvider>
      <AccountView />
    </ToastProvider>,
    user,
    client,
  );
  return client;
}

describe("AccountView", () => {
  it("shows the profile from hospital records, hiding empty rows", async () => {
    await signedIn({ ...TEST_USER, specialty: null });
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(within(profile).getByText("Dr. Ana Reyes")).toBeInTheDocument();
    expect(
      within(profile).getByText("Attending physician"),
    ).toBeInTheDocument();
    expect(within(profile).queryByText("Specialty")).toBeNull();
    expect(within(profile).getAllByText("from hospital records").length).toBe(
      2,
    );
  });

  it("changes the password, and explains a wrong current password", async () => {
    const user = userEvent.setup();
    await signedIn();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = screen.getByRole("dialog", { name: "Change your password" });
    await user.type(within(dialog).getByLabelText("Current password"), "wrong");
    await user.type(
      within(dialog).getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await user.type(
      within(dialog).getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save password" }),
    );
    expect(
      await within(dialog).findByText("That isn't your current password."),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Current password"));
    await user.type(within(dialog).getByLabelText("Current password"), "pw");
    await user.click(
      within(dialog).getByRole("button", { name: "Save password" }),
    );
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
  });

  it("offers two-step setup when it's off", async () => {
    await signedIn({ ...TEST_USER, mfaEnabled: false });
    const security = screen.getByRole("region", { name: "Security" });
    expect(within(security).getByText("Off")).toBeInTheDocument();
    await userEvent.click(
      within(security).getByRole("button", {
        name: "Set up two-step verification",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Two-step verification" }),
    ).toBeInTheDocument();
  });

  it("lists devices, signs one out, and confirms sign out everywhere", async () => {
    const user = userEvent.setup();
    await signedIn();
    const devices = await screen.findByRole("region", { name: "Devices" });
    expect(await within(devices).findByText("This device")).toBeInTheDocument();
    await user.click(
      within(devices).getByRole("button", {
        name: "Sign out Safari on iPhone",
      }),
    );
    await waitFor(() =>
      expect(within(devices).queryByText("Safari on iPhone")).toBeNull(),
    );
    await user.click(
      within(devices).getByRole("button", { name: "Sign out everywhere" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Sign out everywhere?",
    });
    await user.click(
      within(confirm).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("hides devices when the backend can't list them", async () => {
    const client = createMockAuthClient();
    Object.assign(client, {
      capabilities: { ...client.capabilities, devices: false },
    });
    renderWithAuth(
      <ToastProvider>
        <AccountView />
      </ToastProvider>,
      TEST_USER,
      client,
    );
    expect(screen.queryByRole("region", { name: "Devices" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/shell/account-menu.test.tsx components/auth/sign-out.test.tsx components/account`
Expected: FAIL (modules not found).

- [ ] **Step 3: Add `openShortcuts` to the shell**

`components/shell/app-shell.tsx`:

- add `openShortcuts(): void;` to `ShellCtx`;
- add `openShortcuts() {},` to the fallback object in `useShell`;
- add `openShortcuts: () => setKeysOpen(true),` to the `ctx` memo.
  `setKeysOpen` is a stable state setter, so the deps don't change. If
  `keysOpen` is declared below the memo, move its `useState` above it.

- [ ] **Step 4: Write the account menu and the sign-out route**

`components/shell/account-menu.tsx`:

```tsx
"use client";
import {
  Building2,
  CircleHelp,
  Keyboard,
  MoreHorizontal,
  Power,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { initials } from "@/lib/auth/types";
import { useEscape } from "@/lib/hooks/use-escape";
import { cn } from "../ui/cn";
import { useShell } from "./app-shell";

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orchid to-[#6e3c6a] text-xs font-bold text-white",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13.5px] hover:bg-bg focus-visible:bg-bg focus-visible:outline-none";

/** The sidebar footer: who you are, and everything about "you" (design 4). */
export function AccountMenu({ rail }: { rail: boolean }) {
  const { user } = useAuth();
  const { navigate, openShortcuts } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);
  useEscape(open, () => close(true));
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  if (!user) return null;
  const role = [user.roleTitle, user.specialty].filter(Boolean).join(" · ");

  const onMenuKey = (e: KeyboardEvent) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    items[to]?.focus();
  };

  return (
    <div ref={ref} className="relative border-t border-line pt-2.5">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.displayName}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] text-left text-[13px] hover:bg-bg",
          rail ? "justify-center" : "px-1.5 py-1",
        )}
      >
        <Avatar name={user.displayName} />
        {!rail && (
          <>
            <span className="min-w-0">
              <span className="block truncate">{user.displayName}</span>
              {role && (
                <small className="block truncate text-[11px] text-ink-3">
                  {role}
                </small>
              )}
              {user.hospital && (
                <small className="flex items-center gap-1 text-[11px] font-medium text-mint-deep">
                  <Building2 aria-hidden className="size-3" />
                  {user.hospital}
                </small>
              )}
            </span>
            <MoreHorizontal
              aria-hidden
              className="ml-auto size-4 shrink-0 text-ink-3"
            />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[260px] rounded-2xl bg-white p-1.5 shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar name={user.displayName} />
            <span className="min-w-0 text-[13px]">
              <b className="block truncate">
                {user.fullName ?? user.displayName}
              </b>
              <small className="block truncate text-ink-3">
                {user.email ?? user.username}
              </small>
            </span>
          </div>
          <Link
            role="menuitem"
            href="/account"
            className={ITEM}
            onClick={() => close(false)}
          >
            <UserRound aria-hidden className="size-4" />
            Profile &amp; security
          </Link>
          <button
            role="menuitem"
            type="button"
            className={ITEM}
            onClick={() => {
              close(false);
              openShortcuts();
            }}
          >
            <Keyboard aria-hidden className="size-4" />
            Keyboard shortcuts
          </button>
          <Link
            role="menuitem"
            href="/help"
            className={ITEM}
            onClick={() => close(false)}
          >
            <CircleHelp aria-hidden className="size-4" />
            Help &amp; guide
          </Link>
          <button
            role="menuitem"
            type="button"
            className={cn(ITEM, "text-bad")}
            onClick={() => {
              close(false);
              navigate("/sign-out");
            }}
          >
            <Power aria-hidden className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

`components/shell/sidebar.tsx`: replace the footer block from Task 3
(the `{user && (…)}` after the Help link) with
`<AccountMenu rail={rail} />`. Remove the now-unused `Building2`,
`MoreHorizontal`, `useAuth` and `initials` imports.

`components/auth/sign-out.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";

/** /sign-out: reached through the shell guard, so drafts are asked about first. */
export function SignOut() {
  const { status, signOut } = useAuth();
  const router = useRouter();
  // signOut already lands on /sign-in; don't send a second replace after it.
  const started = useRef(false);
  useEffect(() => {
    if (status === "signed_in") {
      started.current = true;
      void signOut("manual");
    } else if (status === "signed_out" && !started.current) {
      router.replace("/sign-in");
    }
  }, [status, signOut, router]);
  return null;
}
```

`app/sign-out/page.tsx`:

```tsx
import { SignOut } from "@/components/auth/sign-out";

export default function SignOutPage() {
  return <SignOut />;
}
```

- [ ] **Step 5: Write the account page**

`components/account/change-password-dialog.tsx`:

```tsx
"use client";
import { useId, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { passwordError } from "@/lib/auth/password-rules";
import type { AuthError } from "@/lib/auth/types";
import { WEAK_COPY } from "../auth/new-password-step";
import { inputClass, PasswordFields } from "../auth/password-fields";
import { authErrorCopy, errorCode } from "../auth/sign-in-form";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

export function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const { client, user, signOut } = useAuth();
  const toast = useToast();
  const id = useId();
  const identity = user?.email ?? user?.username ?? null;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShowErrors(false);
    setError(null);
    onClose();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!current || passwordError(next, confirm, identity) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.changePassword(current, next);
      close();
      toast.show({ title: "Password changed", tone: "ok" });
    } catch (err) {
      const ae = errorCode(err);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
    } finally {
      setBusy(false);
    }
  };
  const wrong = error?.code === "wrong_password";
  const copy =
    !error || wrong
      ? null
      : error.code === "weak_password"
        ? WEAK_COPY
        : authErrorCopy(error.code);

  return (
    <Dialog open={open} onClose={close} title="Change your password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {copy && (
          <Banner tone="bad" title={copy.title}>
            <p>{copy.body}</p>
          </Banner>
        )}
        <div>
          <label
            htmlFor={id}
            className="mb-1.5 block text-[13px] font-semibold"
          >
            Current password
          </label>
          <input
            id={id}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            aria-invalid={wrong || (showErrors && !current) || undefined}
            aria-describedby={wrong ? `${id}-err` : undefined}
            className={inputClass}
          />
          {wrong && (
            <p id={`${id}-err`} className="mt-1 text-[13px] text-bad">
              That isn&apos;t your current password.
            </p>
          )}
        </div>
        <PasswordFields
          next={next}
          confirm={confirm}
          onNext={setNext}
          onConfirm={setConfirm}
          identity={identity}
          showErrors={showErrors}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

`components/account/devices-section.tsx`:

```tsx
"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNow } from "@/lib/hooks/use-now";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export function DevicesSection() {
  const { client, signOut } = useAuth();
  const qc = useQueryClient();
  const now = useNow();
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => client.listDevices(),
  });
  const [confirm, setConfirm] = useState(false);

  const signOutOne = async (id: string) => {
    await client.signOutDevice(id);
    await qc.invalidateQueries({ queryKey: ["devices"] });
  };
  const everywhere = async () => {
    setConfirm(false);
    await client.signOutEverywhere().catch(() => {});
    await signOut("manual");
  };

  return (
    <>
      <section
        aria-labelledby="devices-h"
        className="rounded-3xl bg-white p-5 ring-1 ring-line"
      >
        <h2
          id="devices-h"
          className="font-display text-[26px] font-black leading-none"
        >
          Devices
        </h2>
        <p className="mb-3 mt-1 text-[13.5px] text-ink-2">
          Sign out anything you don&apos;t recognise.
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {devices.data?.map((d) => (
            <li key={d.id} className="flex min-h-14 items-center gap-3 py-2">
              <Monitor aria-hidden className="size-5 text-ink-3" />
              <span className="min-w-0 flex-1 text-[13.5px]">
                <span className="block truncate">{d.label}</span>
                <small className="text-ink-3">
                  {[
                    d.place,
                    d.current ? "active now" : ago(d.lastActiveAt, now),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              {d.current ? (
                <span className="rounded-full bg-lilac px-2.5 py-1 text-[11px] font-semibold text-bloom">
                  This device
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Sign out ${d.label}`}
                  onClick={() => void signOutOne(d.id)}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button
          variant="danger"
          className="mt-3"
          onClick={() => setConfirm(true)}
        >
          Sign out everywhere
        </Button>
      </section>
      {/* Outside the section, so the region holds one "Sign out everywhere". */}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Sign out everywhere?"
      >
        <p className="mb-[18px] text-[14.5px] text-ink-2">
          You&apos;ll be signed out on every device, including this one.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void everywhere()}>
            Sign out everywhere
          </Button>
        </div>
      </Dialog>
    </>
  );
}
```

`components/account/account-view.tsx`:

```tsx
"use client";
import { Lock } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { MfaSetup } from "../auth/mfa-setup";
import { MenuButton } from "../shell/menu-button";
import { Avatar } from "../shell/account-menu";
import { TopBar } from "../shell/top-bar";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";
import { ChangePasswordDialog } from "./change-password-dialog";
import { DevicesSection } from "./devices-section";

const card = "rounded-3xl bg-white p-5 ring-1 ring-line";
const h2 = "font-display text-[26px] font-black leading-none";

export function AccountView() {
  const { user, capabilities } = useAuth();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  if (!user) return null;
  const rows = [
    ["Role", user.roleTitle],
    ["Specialty", user.specialty],
    ["Hospital", user.hospital],
  ].filter((r): r is [string, string] => Boolean(r[1]));

  return (
    <>
      <TopBar title="Profile & security" leading={<MenuButton />} />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[700px] flex-col gap-4">
          <section aria-labelledby="profile-h" className={card}>
            <h2 id="profile-h" className="sr-only">
              Profile
            </h2>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={user.displayName} className="size-12 text-base" />
              <span>
                <b className="block text-[16px]">
                  {user.fullName ?? user.displayName}
                </b>
                <small className="text-[13px] text-ink-3">
                  {user.email ?? user.username}
                </small>
              </span>
            </div>
            <dl className="divide-y divide-line">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex min-h-12 items-center gap-3 py-2 text-[13.5px]"
                >
                  <dt className="w-28 text-ink-3">{label}</dt>
                  <dd className="flex-1">{value}</dd>
                  <dd className="flex items-center gap-1 text-[11.5px] text-ink-3">
                    <Lock aria-hidden className="size-3" />
                    from hospital records
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] text-ink-3">
              Something wrong? Ask your hospital admin to update it.
            </p>
          </section>

          <section aria-labelledby="security-h" className={card}>
            <h2 id="security-h" className={h2}>
              Security
            </h2>
            <p className="mb-3 mt-1 text-[13.5px] text-ink-2">
              Protects patient data across every session.
            </p>
            <div className="flex min-h-14 items-center gap-3 border-t border-line py-2 text-[13.5px]">
              <span className="flex-1">
                Two-step verification
                <small className="block text-ink-3">Authenticator app</small>
              </span>
              <b
                className={user.mfaEnabled ? "text-ok-deep" : "text-warn-deep"}
              >
                {user.mfaEnabled ? "On" : "Off"}
              </b>
              {!user.mfaEnabled && (
                <Button
                  size="sm"
                  aria-label="Set up two-step verification"
                  onClick={() => setMfaOpen(true)}
                >
                  Set up
                </Button>
              )}
            </div>
            <div className="flex min-h-14 items-center gap-3 border-t border-line py-2 text-[13.5px]">
              <span className="flex-1">Password</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Change password"
                onClick={() => setPwOpen(true)}
              >
                Change
              </Button>
            </div>
          </section>

          {capabilities.devices && <DevicesSection />}
        </div>
      </div>
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      <Dialog
        open={mfaOpen}
        onClose={() => setMfaOpen(false)}
        title="Two-step verification"
      >
        {mfaOpen && (
          <MfaSetup
            onDone={() => {
              setMfaOpen(false);
              toast.show({ title: "Two-step verification is on", tone: "ok" });
            }}
          />
        )}
      </Dialog>
    </>
  );
}
```

The Profile section's heading is visually hidden. The design shows the
avatar and name as its header, but the region still needs the name
"Profile".

`app/(clinical)/account/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AccountView } from "@/components/account/account-view";

export const metadata: Metadata = { title: "Profile & security · MHAI" };

export default function AccountPage() {
  return <AccountView />;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run components/shell components/account components/auth/sign-out.test.tsx`
Expected: PASS, including `sidebar.test.tsx`: the hospital text is now
inside the account button.

- [ ] **Step 7: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Add the account menu, guarded sign-out and the profile page"
```

---

### Task 10: Server session sealing and the API helper (BFF core)

**Files:**

- Create:
  - `lib/server/session.ts`
  - `lib/server/api.ts`
  - `lib/server/map-user.ts`
  - `lib/server/http.ts`
  - `lib/server/session.test.ts`
  - `lib/server/api.test.ts`
  - `lib/server/map-user.test.ts`
  - `lib/server/http.test.ts`
- Modify: `.env.example`.

**Interfaces:**

- Consumes: `User`, `FirstStep`, `Role`, `AuthErrorCode` (Task 1).
- Produces:
  - **`session.ts`:**
    - `SESSION_COOKIE = "mhai_session"`, `MFA_COOKIE = "mhai_mfa"`,
      `MFA_TTL_S = 300`;
    - `interface ServerSession { token: string; expiresAt: number; user:
User; steps: FirstStep[] }`;
    - `seal(value: unknown): string` and `unseal<T>(s: string |
undefined): T | null`;
    - `cookieOptions(maxAgeS: number)`;
    - `readSession(now?)`, `writeSession(s, now?)`, `clearSession()`,
      `readMfa(now?)`, `writeMfa(mfaToken, now?)`;
    - `startSession(r: ApiLoginOk, now?)`, which returns `{ status:
"signed_in"; user; steps }`.
  - **`api.ts`:**
    - `class UpstreamError { status: number; code: string }`;
    - `apiBase(): string`;
    - `api<T>(path, { method?, body?, token?, timeoutMs?, fetchImpl?
}): Promise<T>`.
  - **`map-user.ts`:** `ApiUser`, `ApiLoginOk`, `ApiMfaRequired`,
    `toUser(u: ApiUser): User`, `stepsFor(u: ApiUser): FirstStep[]`.
  - **`http.ts`:** `json(status, body?)`, `sameOrigin(req): boolean`,
    `forbidden()`, `authCode(e, ctx): { status: number; code:
AuthErrorCode }`.

**Rules:**

- **Sealing:** AES-256-GCM, with the key `sha256(SESSION_SECRET)` and a
  random 12-byte IV. The output is `base64url(iv | tag | ciphertext)`.
  - Tampered or garbage input unseals to `null`.
  - A missing or short secret (under 32 characters) **throws**. A
    misconfigured server must fail loudly, not look like "signed out".
- **Cookies:** `httpOnly`, `sameSite: "strict"`, `path: "/"`, and `secure`
  in production. The session cookie's `maxAge` equals the token's
  remaining life.
- **`api()`:**
  - `MHAI_API_URL` plus `/api/v1` plus the path;
  - sends `Accept: application/json`, `Content-Type` only when there's a
    body, and `Authorization: Bearer` only when there's a token;
  - `cache: "no-store"` and a 15 s timeout;
  - a network error or timeout becomes `UpstreamError(503,
"unavailable")`;
  - a non-OK response becomes `UpstreamError(status, problem.code ??
"error")`, and the upstream `detail` is never kept;
  - 204 returns `undefined`;
  - a missing `MHAI_API_URL` throws (not "unavailable").
- **`toUser`:**
  - an unknown role becomes `"researcher"`, so it never reaches clinical
    screens;
  - `displayName` is `display_name || full_name || username`;
  - missing fields become `null`;
  - `mfaEnabled` is `mfa_enabled === true`.
- **`stepsFor`:**
  - `must_change_password` → `["terms", "password"]` (first sign-in uses
    a temporary password, per the backend spec §5);
  - then `"mfa"` when `mfa_enabled === false` (design: "Required for
    everyone");
  - `mfa_enabled` missing means no MFA step, because we don't guess.
- **`authCode(e, ctx)`**, where `ctx` is `"login" | "mfa" | "current" |
"other"`:

  | Upstream error                         | Result                                                                                                                 |
  | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
  | anything that isn't an `UpstreamError` | 503 `unavailable`                                                                                                      |
  | `login_locked`                         | 429 `locked`                                                                                                           |
  | `rate_limited`                         | 429 `rate_limited`                                                                                                     |
  | `mfa_invalid`                          | 401 `mfa_invalid`                                                                                                      |
  | `validation_failed`                    | 422: `invalid_credentials` for login, otherwise `weak_password`                                                        |
  | `unauthenticated`                      | 401: `invalid_credentials` for login, `mfa_expired` for mfa, `wrong_password` for current, otherwise `session_expired` |
  | `token_expired`                        | 401: `mfa_expired` for mfa, otherwise `session_expired`                                                                |
  | anything else                          | 503 `unavailable`                                                                                                      |

- **`sameOrigin`:** the `Origin` host must equal `X-Forwarded-Host` or
  `Host`. A missing `Origin` header fails.

- [ ] **Step 1: Write the failing tests**

`lib/server/session.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  const options = new Map<string, Record<string, unknown>>();
  return {
    values,
    options,
    get: (n: string) =>
      values.has(n) ? { name: n, value: values.get(n)! } : undefined,
    set: (n: string, v: string, o: Record<string, unknown>) => {
      values.set(n, v);
      options.set(n, o);
    },
    delete: (n: string) => values.delete(n),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import {
  MFA_COOKIE,
  SESSION_COOKIE,
  clearSession,
  readMfa,
  readSession,
  seal,
  startSession,
  unseal,
  writeMfa,
} from "./session";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "x".repeat(32));
  jar.values.clear();
  jar.options.clear();
});
afterEach(() => vi.unstubAllEnvs());

const LOGIN = {
  access_token: "tok",
  expires_in: 900,
  user: { username: "a.reyes", role: "clinician", mfa_enabled: true },
};

describe("seal / unseal", () => {
  it("round-trips, and two seals of the same value differ", () => {
    const a = seal({ n: 1 });
    expect(unseal(a)).toEqual({ n: 1 });
    expect(seal({ n: 1 })).not.toBe(a);
  });
  it("rejects tampering and garbage", () => {
    const a = seal({ n: 1 });
    const flipped = a.slice(0, -2) + (a.endsWith("A") ? "BB" : "AA");
    expect(unseal(flipped)).toBeNull();
    expect(unseal("not-a-cookie")).toBeNull();
    expect(unseal(undefined)).toBeNull();
  });
  it("rejects a value sealed with another secret", () => {
    const a = seal({ n: 1 });
    vi.stubEnv("SESSION_SECRET", "y".repeat(32));
    expect(unseal(a)).toBeNull();
  });
  it("fails loudly without a strong secret", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => seal({})).toThrow(/SESSION_SECRET/);
    expect(() => unseal("abc")).toThrow(/SESSION_SECRET/);
  });
});

describe("session cookies", () => {
  it("starts a session in a sealed, httpOnly, strict cookie for the token's life", async () => {
    const r = await startSession(LOGIN, 1_000);
    expect(r).toMatchObject({
      status: "signed_in",
      user: { role: "clinician" },
      steps: [],
    });
    const raw = jar.values.get(SESSION_COOKIE)!;
    expect(raw).not.toContain("tok");
    expect(jar.options.get(SESSION_COOKIE)).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 900,
    });
    expect(await readSession(1_000)).toMatchObject({
      token: "tok",
      expiresAt: 901_000,
    });
  });
  it("treats an expired session as none", async () => {
    await startSession(LOGIN, 0);
    expect(await readSession(900_001)).toBeNull();
  });
  it("keeps the MFA step token for 5 minutes, and clears both cookies", async () => {
    await writeMfa("mfa-tok", 0);
    expect(jar.options.get(MFA_COOKIE)).toMatchObject({
      maxAge: 300,
      httpOnly: true,
    });
    expect(await readMfa(299_000)).toMatchObject({ mfaToken: "mfa-tok" });
    expect(await readMfa(300_001)).toBeNull();
    await startSession(LOGIN);
    await clearSession();
    expect(jar.values.size).toBe(0);
  });
});
```

`lib/server/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, UpstreamError } from "./api";

beforeEach(() => vi.stubEnv("MHAI_API_URL", "http://api.test/"));
afterEach(() => vi.unstubAllEnvs());

describe("api", () => {
  it("calls /api/v1 with the bearer token and JSON body", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: 1 }));
    expect(
      await api("/auth/logout", {
        method: "POST",
        token: "t",
        body: { a: 1 },
        fetchImpl,
      }),
    ).toEqual({ ok: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/api/v1/auth/logout");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"a":1}');
    expect(init.cache).toBe("no-store");
  });
  it("keeps only the problem code, never the detail", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { code: "login_locked", detail: "secret detail", status: 429 },
        { status: 429 },
      ),
    );
    const e = (await api("/auth/login", { fetchImpl }).catch(
      (x) => x,
    )) as UpstreamError;
    expect(e).toBeInstanceOf(UpstreamError);
    expect(e).toMatchObject({ status: 429, code: "login_locked" });
    expect(JSON.stringify(e)).not.toContain("secret detail");
  });
  it("turns network failures and timeouts into unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(api("/x", { fetchImpl })).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
    });
  });
  it("returns nothing for 204", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await api("/x", { fetchImpl })).toBeUndefined();
  });
  it("throws loudly when the API address isn't set", async () => {
    vi.stubEnv("MHAI_API_URL", "");
    await expect(api("/x", { fetchImpl: vi.fn() })).rejects.toThrow(
      /MHAI_API_URL/,
    );
  });
});
```

`lib/server/map-user.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stepsFor, toUser } from "./map-user";

describe("toUser", () => {
  it("maps what the API sends and nulls what it doesn't", () => {
    expect(toUser({ username: "a.reyes", role: "clinician" })).toEqual({
      username: "a.reyes",
      email: null,
      displayName: "a.reyes",
      fullName: null,
      role: "clinician",
      roleTitle: null,
      specialty: null,
      hospital: null,
      mfaEnabled: false,
    });
    expect(
      toUser({ username: "u", role: "clinician", full_name: "Dr. Ana Reyes" })
        .displayName,
    ).toBe("Dr. Ana Reyes");
  });
  it("treats an unknown role as non-clinical", () => {
    expect(toUser({ username: "u", role: "system" }).role).toBe("researcher");
  });
});

describe("stepsFor", () => {
  it("derives first sign-in steps without guessing", () => {
    expect(stepsFor({ username: "u", role: "clinician" })).toEqual([]);
    expect(
      stepsFor({
        username: "u",
        role: "clinician",
        must_change_password: true,
        mfa_enabled: false,
      }),
    ).toEqual(["terms", "password", "mfa"]);
    expect(
      stepsFor({ username: "u", role: "clinician", mfa_enabled: true }),
    ).toEqual([]);
  });
});
```

`lib/server/http.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { UpstreamError } from "./api";
import { authCode, json, sameOrigin } from "./http";

const req = (h: Record<string, string>) =>
  new Request("http://demo.test/api/auth/login", {
    method: "POST",
    headers: h,
  });

describe("sameOrigin", () => {
  it("accepts a matching Origin and rejects others or none", () => {
    expect(
      sameOrigin(req({ origin: "https://demo.test", host: "demo.test" })),
    ).toBe(true);
    expect(
      sameOrigin(
        req({
          origin: "https://demo.test",
          host: "127.0.0.1:8080",
          "x-forwarded-host": "demo.test",
        }),
      ),
    ).toBe(true);
    expect(
      sameOrigin(req({ origin: "https://evil.test", host: "demo.test" })),
    ).toBe(false);
    expect(sameOrigin(req({ host: "demo.test" }))).toBe(false);
  });
});

describe("authCode", () => {
  const up = (code: string, status = 401) => new UpstreamError(status, code);
  it.each([
    [up("login_locked", 429), "login", 429, "locked"],
    [up("rate_limited", 429), "login", 429, "rate_limited"],
    [up("unauthenticated"), "login", 401, "invalid_credentials"],
    [up("unauthenticated"), "mfa", 401, "mfa_expired"],
    [up("mfa_invalid"), "mfa", 401, "mfa_invalid"],
    [up("unauthenticated"), "current", 401, "wrong_password"],
    [up("token_expired"), "current", 401, "session_expired"],
    [up("validation_failed", 422), "other", 422, "weak_password"],
    [up("internal", 500), "login", 503, "unavailable"],
    [new TypeError("x"), "login", 503, "unavailable"],
  ] as const)("%o in %s → %i %s", (e, ctx, status, code) => {
    expect(authCode(e, ctx)).toEqual({ status, code });
  });
});

describe("json", () => {
  it("never lets responses be cached", () => {
    expect(json(200, { a: 1 }).headers.get("Cache-Control")).toBe("no-store");
    expect(json(204).status).toBe(204);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/server/session.test.ts lib/server/api.test.ts lib/server/map-user.test.ts lib/server/http.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `map-user.ts` and `api.ts`**

`lib/server/map-user.ts`:

```ts
import type { FirstStep, Role, User } from "../auth/types";

/** The user as the MHAI API returns it. Optional fields arrive with backend §10 work. */
export interface ApiUser {
  username: string;
  role: string;
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  role_title?: string | null;
  specialty?: string | null;
  hospital?: string | null;
  mfa_enabled?: boolean;
  must_change_password?: boolean;
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

const ROLES: readonly Role[] = ["clinician", "admin", "auditor", "researcher"];

export function toUser(u: ApiUser): User {
  return {
    username: u.username,
    email: u.email ?? null,
    displayName: u.display_name || u.full_name || u.username,
    fullName: u.full_name ?? null,
    // Anything unexpected is treated as non-clinical, never as a clinician.
    role: ROLES.includes(u.role as Role) ? (u.role as Role) : "researcher",
    roleTitle: u.role_title ?? null,
    specialty: u.specialty ?? null,
    hospital: u.hospital ?? null,
    mfaEnabled: u.mfa_enabled === true,
  };
}

/** First sign-in steps, only from what the API says (never guessed). */
export function stepsFor(u: ApiUser): FirstStep[] {
  const steps: FirstStep[] = [];
  if (u.must_change_password) steps.push("terms", "password");
  if (u.mfa_enabled === false) steps.push("mfa");
  return steps;
}
```

`lib/server/api.ts`:

```ts
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "UpstreamError";
  }
}

export function apiBase(): string {
  const u = process.env.MHAI_API_URL;
  if (!u) throw new Error("MHAI_API_URL is not set");
  return `${u.replace(/\/+$/, "")}/api/v1`;
}

/** Server-side call to the MHAI API. Keeps only the problem `code`. */
export async function api<T>(
  path: string,
  {
    method = "GET",
    body,
    token,
    timeoutMs = 15_000,
    fetchImpl = fetch,
  }: {
    method?: string;
    body?: unknown;
    token?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<T> {
  const url = `${apiBase()}${path}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new UpstreamError(503, "unavailable");
  }
  if (!res.ok) {
    let code = "error";
    try {
      const p = (await res.json()) as { code?: unknown };
      if (typeof p.code === "string") code = p.code;
    } catch {
      // Not problem+json: keep the generic code.
    }
    throw new UpstreamError(res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Write `session.ts` and `http.ts`**

`lib/server/session.ts`:

```ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";
import type { FirstStep, SignInResult, User } from "../auth/types";
import { stepsFor, toUser, type ApiLoginOk } from "./map-user";

export const SESSION_COOKIE = "mhai_session";
export const MFA_COOKIE = "mhai_mfa";
export const MFA_TTL_S = 300;

export interface ServerSession {
  token: string;
  expiresAt: number;
  user: User;
  steps: FirstStep[];
}
interface MfaPending {
  mfaToken: string;
  expiresAt: number;
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    c.update(JSON.stringify(value), "utf8"),
    c.final(),
  ]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined): T | null {
  const k = key(); // outside the try: a missing secret must throw
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([
      d.update(raw.subarray(28)),
      d.final(),
    ]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAgeS: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: Math.max(1, Math.floor(maxAgeS)),
});

export async function readSession(
  now = Date.now(),
): Promise<ServerSession | null> {
  const s = unseal<ServerSession>((await cookies()).get(SESSION_COOKIE)?.value);
  return s && s.expiresAt > now ? s : null;
}

export async function writeSession(s: ServerSession, now = Date.now()) {
  (await cookies()).set(
    SESSION_COOKIE,
    seal(s),
    cookieOptions((s.expiresAt - now) / 1000),
  );
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
}

export async function readMfa(now = Date.now()): Promise<MfaPending | null> {
  const m = unseal<MfaPending>((await cookies()).get(MFA_COOKIE)?.value);
  return m && m.expiresAt > now ? m : null;
}

export async function writeMfa(mfaToken: string, now = Date.now()) {
  (await cookies()).set(
    MFA_COOKIE,
    seal({ mfaToken, expiresAt: now + MFA_TTL_S * 1000 }),
    cookieOptions(MFA_TTL_S),
  );
}

/** Seals a fresh API token into the session cookie and drops any MFA step. */
export async function startSession(
  r: ApiLoginOk,
  now = Date.now(),
): Promise<Extract<SignInResult, { status: "signed_in" }>> {
  const s: ServerSession = {
    token: r.access_token,
    expiresAt: now + r.expires_in * 1000,
    user: toUser(r.user),
    steps: stepsFor(r.user),
  };
  await writeSession(s, now);
  (await cookies()).delete(MFA_COOKIE);
  return { status: "signed_in", user: s.user, steps: s.steps };
}
```

`lib/server/http.ts`:

```ts
import type { AuthErrorCode } from "../auth/types";
import { UpstreamError } from "./api";

export const json = (status: number, body?: object) =>
  body === undefined
    ? new Response(null, { status, headers: { "Cache-Control": "no-store" } })
    : Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const forbidden = () => json(403, { code: "forbidden" });

/** Writes must come from this app's own pages (SameSite=Strict plus this). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Maps an upstream failure to the app's auth error codes (§ Task 10 table). */
export function authCode(
  e: unknown,
  ctx: "login" | "mfa" | "current" | "other",
): { status: number; code: AuthErrorCode } {
  if (!(e instanceof UpstreamError))
    return { status: 503, code: "unavailable" };
  switch (e.code) {
    case "login_locked":
      return { status: 429, code: "locked" };
    case "rate_limited":
      return { status: 429, code: "rate_limited" };
    case "mfa_invalid":
      return { status: 401, code: "mfa_invalid" };
    case "validation_failed":
      return {
        status: 422,
        code: ctx === "login" ? "invalid_credentials" : "weak_password",
      };
    case "unauthenticated":
      return {
        status: 401,
        code:
          ctx === "login"
            ? "invalid_credentials"
            : ctx === "mfa"
              ? "mfa_expired"
              : ctx === "current"
                ? "wrong_password"
                : "session_expired",
      };
    case "token_expired":
      return {
        status: 401,
        code: ctx === "mfa" ? "mfa_expired" : "session_expired",
      };
    default:
      return { status: 503, code: "unavailable" };
  }
}
```

The `current` mapping relies on the BFF checking the session's expiry
before calling `/auth/password`. With a token known to be valid, a 401
`unauthenticated` there can only mean the current password was wrong.

Append to `.env.example`:

```bash
# Live mode only (NEXT_PUBLIC_USE_MOCK unset or "false"):
# MHAI API base, without /api/v1.
# MHAI_API_URL=http://localhost:8000
# Seals the session cookie. At least 32 characters: openssl rand -base64 48
# SESSION_SECRET=
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/server`
Expected: PASS, along with any tests already in `lib/server`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write lib/server .env.example && npm run lint && npm run typecheck
git add lib/server .env.example
git commit -m "Add the BFF core: sealed session cookies and the MHAI API helper"
```

---

### Task 11: The BFF auth routes

**Files:**

- Create:
  - `app/api/auth/login/route.ts`
  - `app/api/auth/mfa/route.ts`
  - `app/api/auth/session/route.ts`
  - `app/api/auth/logout/route.ts`
  - `app/api/auth/password/route.ts`
  - `app/api/auth/terms/route.ts`
  - `app/api/auth/mfa/setup/route.ts`
  - `app/api/auth/mfa/setup/confirm/route.ts`
  - `app/api/auth/auth-routes.test.ts`

**Interfaces:**

- Consumes:
  - `api`, `UpstreamError` (Task 10);
  - `readSession`, `writeSession`, `clearSession`, `readMfa`,
    `writeMfa`, `startSession` (Task 10);
  - `json`, `sameOrigin`, `forbidden`, `authCode` (Task 10);
  - `ApiLoginOk`, `ApiMfaRequired` (Task 10).
- Produces the endpoints the live auth client calls in Task 12. On error
  every endpoint returns `{code: AuthErrorCode}` with the mapped status,
  and every `POST` checks `sameOrigin` first (403 `{code:"forbidden"}`).

| Endpoint                           | Body in                           | Upstream                                               | Out                                                                                |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `POST /api/auth/login`             | `{login, password}`               | `POST /auth/login {username, password}`                | `{status:"signed_in", user, steps}` or `{status:"mfa_required"}` (sets `mhai_mfa`) |
| `POST /api/auth/mfa`               | `{code, backup, trustDevice}`     | `POST /auth/mfa/challenge {mfa_token, code}`           | `{status:"signed_in", user, steps}`. No `mhai_mfa` → 401 `mfa_expired`.            |
| `GET /api/auth/session`            | none                              | none                                                   | `{user, steps}`, or 401 `session_expired` (and clears cookies)                     |
| `POST /api/auth/logout`            | none                              | `POST /auth/logout` (best effort)                      | 204, cookies cleared                                                               |
| `POST /api/auth/password`          | `{current: string \| null, next}` | `POST /auth/password {current_password, new_password}` | 204; removes the `password` step from the session                                  |
| `POST /api/auth/terms`             | none                              | none (backend §10 item 8 isn't built)                  | 204; removes the `terms` step                                                      |
| `POST /api/auth/mfa/setup`         | none                              | `POST /auth/mfa/enroll`                                | `{otpauthUri, secret, backupCodes}`; `secret` is read from the URI                 |
| `POST /api/auth/mfa/setup/confirm` | `{code}`                          | `POST /auth/mfa/verify {code}`                         | 204; sets `user.mfaEnabled`, removes the `mfa` step                                |

Routes needing a session return 401 `session_expired` without one. The
`/auth/password` body field names are this plan's assumption: the
backend spec doesn't name them. They live in one place,
`app/api/auth/password/route.ts`; align them when `openapi.json` lands.

- [ ] **Step 1: Write the failing test**

`app/api/auth/auth-routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: (n: string) =>
      values.has(n) ? { name: n, value: values.get(n)! } : undefined,
    set: (n: string, v: string) => void values.set(n, v),
    delete: (n: string) => void values.delete(n),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/api")>()),
  api: (...a: unknown[]) => upstream(...a),
}));

import { UpstreamError } from "@/lib/server/api";
import { MFA_COOKIE, SESSION_COOKIE, readSession } from "@/lib/server/session";
import { POST as login } from "./login/route";
import { POST as mfa } from "./mfa/route";
import { GET as session } from "./session/route";
import { POST as logout } from "./logout/route";
import { POST as password } from "./password/route";
import { POST as terms } from "./terms/route";
import { POST as setup } from "./mfa/setup/route";
import { POST as confirm } from "./mfa/setup/confirm/route";

const post = (body?: unknown, origin = "http://demo.test") =>
  new Request("http://demo.test/api/auth/x", {
    method: "POST",
    headers: { "content-type": "application/json", host: "demo.test", origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const LOGIN_OK = {
  access_token: "tok",
  expires_in: 900,
  user: { username: "a.reyes", role: "clinician", mfa_enabled: true },
};

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(40));
  jar.values.clear();
  upstream.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

async function signedIn(extra: Partial<typeof LOGIN_OK.user> = {}) {
  upstream.mockResolvedValueOnce({
    ...LOGIN_OK,
    user: { ...LOGIN_OK.user, ...extra },
  });
  await login(post({ login: "a.reyes", password: "pw" }));
}

describe("login", () => {
  it("signs in, sealing the token in a cookie the page never sees", async () => {
    upstream.mockResolvedValueOnce(LOGIN_OK);
    const res = await login(post({ login: " a.reyes ", password: "pw" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "signed_in",
      user: { username: "a.reyes" },
      steps: [],
    });
    expect(JSON.stringify(body)).not.toContain("tok");
    expect(upstream).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: { username: "a.reyes", password: "pw" },
    });
    expect(jar.values.get(SESSION_COOKIE)).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("holds the MFA step token in its own cookie", async () => {
    upstream.mockResolvedValueOnce({ mfa_required: true, mfa_token: "m" });
    const res = await login(post({ login: "a", password: "pw" }));
    expect(await res.json()).toEqual({ status: "mfa_required" });
    expect(jar.values.get(MFA_COOKIE)).toBeTruthy();
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });
  it.each([
    [new UpstreamError(401, "unauthenticated"), 401, "invalid_credentials"],
    [new UpstreamError(429, "login_locked"), 429, "locked"],
    [new UpstreamError(503, "unavailable"), 503, "unavailable"],
  ])("maps %o", async (err, status, code) => {
    upstream.mockRejectedValueOnce(err);
    const res = await login(post({ login: "a", password: "pw" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ code });
  });
  it("refuses another site's form", async () => {
    const res = await login(
      post({ login: "a", password: "pw" }, "https://evil.test"),
    );
    expect(res.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("mfa", () => {
  it("completes sign-in with the held MFA token", async () => {
    upstream.mockResolvedValueOnce({ mfa_required: true, mfa_token: "m" });
    await login(post({ login: "a", password: "pw" }));
    upstream.mockResolvedValueOnce(LOGIN_OK);
    const res = await mfa(
      post({ code: "123456", backup: false, trustDevice: false }),
    );
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenLastCalledWith("/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: "m", code: "123456" },
    });
    expect(jar.values.get(MFA_COOKIE)).toBeUndefined();
  });
  it("says the step expired when nothing is held", async () => {
    const res = await mfa(
      post({ code: "123456", backup: false, trustDevice: false }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "mfa_expired" });
  });
});

describe("session, terms, password, logout", () => {
  it("reports the session and its steps, or 401", async () => {
    expect((await session()).status).toBe(401);
    await signedIn({ must_change_password: true });
    const res = await session();
    expect(await res.json()).toMatchObject({ steps: ["terms", "password"] });
  });
  it("clears first sign-in steps as they're done", async () => {
    await signedIn({ must_change_password: true });
    expect((await terms(post())).status).toBe(204);
    upstream.mockResolvedValueOnce(undefined);
    expect(
      (await password(post({ current: null, next: "tram-lantern-okra" })))
        .status,
    ).toBe(204);
    expect(upstream).toHaveBeenLastCalledWith("/auth/password", {
      method: "POST",
      token: "tok",
      body: { current_password: null, new_password: "tram-lantern-okra" },
    });
    expect((await readSession())?.steps).toEqual([]);
  });
  it("calls a wrong current password what it is", async () => {
    await signedIn();
    upstream.mockRejectedValueOnce(new UpstreamError(401, "unauthenticated"));
    const res = await password(
      post({ current: "nope", next: "tram-lantern-okra" }),
    );
    expect(await res.json()).toEqual({ code: "wrong_password" });
  });
  it("needs a session for account changes", async () => {
    const res = await password(post({ current: null, next: "x".repeat(12) }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
  });
  it("signs out upstream and clears both cookies", async () => {
    await signedIn();
    upstream.mockResolvedValueOnce(undefined);
    expect((await logout(post())).status).toBe(204);
    expect(upstream).toHaveBeenLastCalledWith("/auth/logout", {
      method: "POST",
      token: "tok",
    });
    expect(jar.values.size).toBe(0);
  });
  it("still clears cookies when the upstream sign-out fails", async () => {
    await signedIn();
    upstream.mockRejectedValueOnce(new UpstreamError(503, "unavailable"));
    expect((await logout(post())).status).toBe(204);
    expect(jar.values.size).toBe(0);
  });
});

describe("two-step setup", () => {
  it("returns the QR URI, its secret and the codes, then confirms", async () => {
    await signedIn({ mfa_enabled: false });
    upstream.mockResolvedValueOnce({
      otpauth_uri:
        "otpauth://totp/MHAI:a.reyes?secret=ABCDEF234567&issuer=MHAI",
      recovery_codes: ["AAAA-1111"],
    });
    const res = await setup(post());
    expect(await res.json()).toEqual({
      otpauthUri: "otpauth://totp/MHAI:a.reyes?secret=ABCDEF234567&issuer=MHAI",
      secret: "ABCDEF234567",
      backupCodes: ["AAAA-1111"],
    });
    upstream.mockResolvedValueOnce(undefined);
    expect((await confirm(post({ code: "123456" }))).status).toBe(204);
    expect(await readSession()).toMatchObject({
      user: { mfaEnabled: true },
      steps: [],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/auth`
Expected: FAIL (route modules not found).

- [ ] **Step 3: Write the routes**

`app/api/auth/login/route.ts`:

```ts
import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import type { ApiLoginOk, ApiMfaRequired } from "@/lib/server/map-user";
import { startSession, writeMfa } from "@/lib/server/session";

const Body = z.object({
  login: z.string().trim().min(1).max(256),
  password: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "invalid_credentials" });
  try {
    const r = await api<ApiLoginOk | ApiMfaRequired>("/auth/login", {
      method: "POST",
      body: { username: body.data.login, password: body.data.password },
    });
    if ("mfa_required" in r && r.mfa_required) {
      await writeMfa(r.mfa_token);
      return json(200, { status: "mfa_required" });
    }
    return json(200, await startSession(r as ApiLoginOk));
  } catch (e) {
    const { status, code } = authCode(e, "login");
    return json(status, { code });
  }
}
```

`app/api/auth/mfa/route.ts`:

```ts
import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import type { ApiLoginOk } from "@/lib/server/map-user";
import { readMfa, startSession } from "@/lib/server/session";

const Body = z.object({
  code: z.string().trim().min(1).max(20),
  backup: z.boolean(),
  // Not sent upstream yet: the backend has no "trust this device" (§10 item 7).
  trustDevice: z.boolean(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "mfa_invalid" });
  const pending = await readMfa();
  if (!pending) return json(401, { code: "mfa_expired" });
  try {
    const r = await api<ApiLoginOk>("/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: pending.mfaToken, code: body.data.code },
    });
    return json(200, await startSession(r));
  } catch (e) {
    const { status, code } = authCode(e, "mfa");
    return json(status, { code });
  }
}
```

`app/api/auth/session/route.ts`:

```ts
import { json } from "@/lib/server/http";
import { clearSession, readSession } from "@/lib/server/session";

export async function GET() {
  const s = await readSession();
  if (!s) {
    await clearSession();
    return json(401, { code: "session_expired" });
  }
  return json(200, { user: s.user, steps: s.steps });
}
```

`app/api/auth/logout/route.ts`:

```ts
import { api } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { clearSession, readSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (s)
    await api("/auth/logout", { method: "POST", token: s.token }).catch(
      () => {},
    );
  await clearSession();
  return json(204);
}
```

`app/api/auth/password/route.ts`:

```ts
import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

const Body = z.object({
  current: z.string().max(1024).nullable(),
  next: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "weak_password" });
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    // Field names are an assumption until the backend's openapi.json lands.
    await api("/auth/password", {
      method: "POST",
      token: s.token,
      body: {
        current_password: body.data.current,
        new_password: body.data.next,
      },
    });
  } catch (e) {
    const { status, code } = authCode(
      e,
      body.data.current === null ? "other" : "current",
    );
    return json(status, { code });
  }
  await writeSession({ ...s, steps: s.steps.filter((x) => x !== "password") });
  return json(204);
}
```

`app/api/auth/terms/route.ts`:

```ts
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

/** Marks the terms step done for this session. Backend §10 item 8 will record it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  await writeSession({ ...s, steps: s.steps.filter((x) => x !== "terms") });
  return json(204);
}
```

`app/api/auth/mfa/setup/route.ts`:

```ts
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    const r = await api<{ otpauth_uri: string; recovery_codes: string[] }>(
      "/auth/mfa/enroll",
      { method: "POST", token: s.token },
    );
    return json(200, {
      otpauthUri: r.otpauth_uri,
      secret: new URL(r.otpauth_uri).searchParams.get("secret") ?? "",
      backupCodes: r.recovery_codes,
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
```

`app/api/auth/mfa/setup/confirm/route.ts`:

```ts
import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

const Body = z.object({ code: z.string().trim().min(1).max(20) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "mfa_invalid" });
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    await api("/auth/mfa/verify", {
      method: "POST",
      token: s.token,
      body: { code: body.data.code },
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
  await writeSession({
    ...s,
    user: { ...s.user, mfaEnabled: true },
    steps: s.steps.filter((x) => x !== "mfa"),
  });
  return json(204);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write app/api && npm run lint && npm run typecheck
git add app/api/auth
git commit -m "Add the BFF auth routes: login, two-step, session, password, logout"
```

---

### Task 12: The clinical API proxy, the live clients and session expiry

**Files:**

- Create:
  - `app/api/v1/[...path]/route.ts`
  - `app/api/v1/proxy.test.ts`
  - `lib/api/errors.ts`
  - `lib/api/live.ts`
  - `lib/api/live.test.ts`
  - `lib/auth/events.ts`
  - `lib/auth/live.ts`
  - `lib/auth/live.test.ts`
  - `lib/auth/expiry.test.tsx`
- Modify:
  - `lib/api/client.ts` and `lib/auth/client.ts`: live when not in mock
    mode;
  - `lib/auth/auth-context.tsx`: listens for `onUnauthorized`;
  - `app/providers.tsx`: no retries on 4xx.

**Interfaces:**

- Consumes: Task 10's `readSession`, `writeSession`, `clearSession`,
  `api`, `apiBase`, `json`, `sameOrigin` and `forbidden`; `MhaiClient`
  and the contract types (Plan 1); `AuthClient`, `AuthError`,
  `Capabilities` (Task 1).
- Produces:
  - `class ApiError { status: number; code: string }`;
  - `onUnauthorized(fn): () => void` and `reportUnauthorized(): void`;
  - `createLiveClient(opts?: { fetchImpl? }): MhaiClient`;
  - `createLiveAuthClient(opts?: { fetchImpl? }): AuthClient`;
  - `LIVE_CAPABILITIES`;
  - `getClient()` and `getAuthClient()` now return the live clients
    unless `NEXT_PUBLIC_USE_MOCK === "true"`.

**Proxy rules** (`/api/v1/<path>` → `${MHAI_API_URL}/api/v1/<path>`):

- **Allowed paths:** the first segment must be `queries`, `feedback`,
  `corrections` or `readyz`. Any `.`, `..` or empty segment is a 404
  `{code:"not_found"}`, so no traversal into admin endpoints.
- **Methods:** `GET` and `POST`. `POST` needs `sameOrigin`, and bodies are
  capped at 64 KB (413 `{code:"too_large"}`).
- **No session:** clear cookies and return 401 `{code:"session_expired"}`.
- **Sliding refresh:** within 5 minutes of expiry, `POST /auth/refresh`
  with the current token and reseal the new `{access_token, expires_in}`.
  If the refresh fails, carry on with the still-valid token.
- **Forwarding:** only `Authorization`, `Accept`, and `Content-Type` when
  there's a body. Never browser cookies or headers. The query string is
  kept, and the timeout is 30 s.
- **Upstream 401:** clear cookies and return 401 `{code:"session_expired"}`.
  A network failure is 503 `{code:"unavailable"}`.
- **Otherwise:** stream the upstream status and body back, with its
  `Content-Type` and `Cache-Control: no-store`.

**Live clinical client** (`lib/api/live.ts`), calling same-origin
`/api/v1`:

- `createQuery` → `POST /queries` (202) → `{query_id}`;
- `getStatus` → `GET /queries/{id}`;
- `getResult` → `GET /queries/{id}/result`;
- `sendFeedback` → `POST /feedback`;
- `getReadiness` → `GET /readyz`:
  - 200 → `{ok: true, degraded_services: []}`;
  - 503 with a JSON body → `{ok: false, degraded_services: <keys whose
value is false>}`.
- Ids are encoded with `encodeURIComponent`.
- A 401 calls `reportUnauthorized()` and throws `ApiError(401,
"session_expired")`.
- Other non-OK responses throw `ApiError(status, body.code ?? "error")`,
  and a network failure throws `ApiError(0, "network")`.

**Live auth client** (`lib/auth/live.ts`) calls `/api/auth/*` (Task 11):

- `LIVE_CAPABILITIES` is all `false` until the backend's §10 work lands.
- **Known codes** pass through as `AuthError(code)`. Anything else,
  including network failures, becomes `AuthError("unavailable")`.
- `getSession` → `GET /session`: 200 → `{user, steps}`, 401 → `null`.
- Not supported yet, so each throws `AuthError("unavailable")` (the UI
  hides them anyway): `signInWithHospital`, `requestPasswordReset`,
  `resetPassword`, `listDevices`, `signOutDevice`, `signOutEverywhere`.
- `signOut` ignores failures.

**Expiry in the app:** `AuthProvider` subscribes with
`onUnauthorized(() => void signOut("expired"))`. Because `signOut` is
idempotent, a burst of 401s (several polls at once) signs out once and
redirects once. In `Providers`, queries don't retry when the error is an
`ApiError` with a 4xx status; they retry once otherwise.

- [ ] **Step 1: Write the failing tests**

`app/api/v1/proxy.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: (n: string) =>
      values.has(n) ? { name: n, value: values.get(n)! } : undefined,
    set: (n: string, v: string) => void values.set(n, v),
    delete: (n: string) => void values.delete(n),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import {
  SESSION_COOKIE,
  readSession,
  writeSession,
} from "@/lib/server/session";
import { TEST_USER } from "@/tests/auth-wrapper";
import { GET, POST } from "./[...path]/route";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(40));
  vi.stubEnv("MHAI_API_URL", "http://api.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  jar.values.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const get = (url = "http://demo.test/api/v1/queries/q1") =>
  new Request(url, { headers: { host: "demo.test", cookie: "other=1" } });
const post = (body: string, origin = "http://demo.test") =>
  new Request("http://demo.test/api/v1/queries", {
    method: "POST",
    headers: { host: "demo.test", origin, "content-type": "application/json" },
    body,
  });
const session = (expiresInMs = 10 * 60_000) =>
  writeSession({
    token: "tok",
    expiresAt: Date.now() + expiresInMs,
    user: TEST_USER,
    steps: [],
  });

describe("clinical API proxy", () => {
  it("forwards with the bearer token only, and never caches", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json({ status: "processing" }));
    const res = await GET(
      get("http://demo.test/api/v1/queries/q1?x=1"),
      ctx("queries", "q1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/queries/q1?x=1");
    expect(init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer tok",
    });
  });

  it("posts the body through", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json({ query_id: "q2" }, { status: 202 }),
    );
    const res = await POST(post('{"a":1}'), ctx("queries"));
    expect(res.status).toBe(202);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].body).toBe(
      '{"a":1}',
    );
  });

  it.each([
    [["admin", "users"]],
    [["queries", "..", "admin", "users"]],
    [["queries", ""]],
    [["auth", "login"]],
  ])("refuses %j", async (path) => {
    await session();
    const res = await GET(get(), ctx(...path));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the session ended when there isn't one", async () => {
    const res = await GET(get(), ctx("queries", "q1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
  });

  it("clears the session when the API rejects the token", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "token_expired" }, { status: 401 }),
    );
    const res = await GET(get(), ctx("queries", "q1"));
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("refreshes a token close to expiry", async () => {
    await session(60_000);
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ access_token: "tok2", expires_in: 900 }),
      )
      .mockResolvedValueOnce(Response.json({}));
    await GET(get(), ctx("queries", "q1"));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://api.test/api/v1/auth/refresh",
    );
    expect(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer tok2",
    });
    expect((await readSession())?.token).toBe("tok2");
  });

  it("guards writes and their size", async () => {
    await session();
    expect(
      (await POST(post("{}", "https://evil.test"), ctx("queries"))).status,
    ).toBe(403);
    expect(
      (await POST(post("x".repeat(64 * 1024 + 1)), ctx("queries"))).status,
    ).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the API being down", async () => {
    await session();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await GET(get(), ctx("queries", "q1"));
    expect(res.status).toBe(503);
  });
});
```

`lib/api/live.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { onUnauthorized } from "../auth/events";
import { ApiError } from "./errors";
import { createLiveClient } from "./live";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : Response.json(body, { status }),
  );

describe("live clinical client", () => {
  it("creates a query through the same-origin proxy", async () => {
    const fetchImpl = reply(202, { query_id: "q1", status: "queued" });
    const c = createLiveClient({ fetchImpl });
    expect(await c.createQuery({} as never)).toEqual({ query_id: "q1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/v1/queries");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(String(init.body)).not.toMatch(/user_id|clinician_id/);
  });

  it("encodes ids", async () => {
    const fetchImpl = reply(200, {});
    await createLiveClient({ fetchImpl }).getResult("a/b");
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/v1/queries/a%2Fb/result",
    );
  });

  it("reports a 401 once per call and throws session_expired", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    const c = createLiveClient({
      fetchImpl: reply(401, { code: "session_expired" }),
    });
    await expect(c.getStatus("q1")).rejects.toMatchObject({
      status: 401,
      code: "session_expired",
    });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it("keeps the API's error code", async () => {
    const c = createLiveClient({
      fetchImpl: reply(409, { code: "result_not_ready" }),
    });
    const e = await c.getResult("q1").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: "result_not_ready" });
  });

  it("reads readiness, naming what's down", async () => {
    expect(
      await createLiveClient({
        fetchImpl: reply(200, { db: true }),
      }).getReadiness(),
    ).toEqual({
      ok: true,
      degraded_services: [],
    });
    const down = createLiveClient({
      fetchImpl: reply(503, { db: true, worker: false, ollama: false }),
    });
    expect(await down.getReadiness()).toEqual({
      ok: false,
      degraded_services: ["worker", "ollama"],
    });
  });

  it("turns a network failure into an ApiError", async () => {
    const c = createLiveClient({
      fetchImpl: vi.fn(async () => {
        throw new TypeError("offline");
      }),
    });
    await expect(c.getStatus("q1")).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
  });
});
```

`lib/auth/live.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { LIVE_CAPABILITIES, createLiveAuthClient } from "./live";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : Response.json(body, { status }),
  );

describe("live auth client", () => {
  it("offers only what the backend design has", () => {
    expect(LIVE_CAPABILITIES).toEqual({
      sso: false,
      emailLogin: false,
      passwordReset: false,
      devices: false,
      trustDevice: false,
    });
  });
  it("signs in through the BFF", async () => {
    const fetchImpl = reply(200, { status: "mfa_required" });
    const c = createLiveAuthClient({ fetchImpl });
    expect(await c.signIn("a.reyes", "pw")).toEqual({ status: "mfa_required" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(String(init.body))).toEqual({
      login: "a.reyes",
      password: "pw",
    });
  });
  it("passes known error codes through and hides unknown ones", async () => {
    await expect(
      createLiveAuthClient({
        fetchImpl: reply(429, { code: "locked" }),
      }).signIn("a", "b"),
    ).rejects.toMatchObject({ code: "locked" });
    await expect(
      createLiveAuthClient({
        fetchImpl: reply(500, { code: "kaboom" }),
      }).signIn("a", "b"),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      createLiveAuthClient({
        fetchImpl: vi.fn(async () => {
          throw new TypeError("offline");
        }),
      }).signIn("a", "b"),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("reads the session, or none", async () => {
    expect(
      await createLiveAuthClient({
        fetchImpl: reply(401, { code: "session_expired" }),
      }).getSession(),
    ).toBeNull();
    const s = { user: { username: "a" }, steps: [] };
    expect(
      await createLiveAuthClient({ fetchImpl: reply(200, s) }).getSession(),
    ).toEqual(s);
  });
  it("refuses what isn't supported yet", async () => {
    const c = createLiveAuthClient({ fetchImpl: vi.fn() });
    await expect(c.listDevices()).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(c.requestPasswordReset("a@b.c")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
  it("signs out even if the server call fails", async () => {
    const c = createLiveAuthClient({ fetchImpl: reply(503) });
    await expect(c.signOut()).resolves.toBeUndefined();
  });
});
```

`lib/auth/expiry.test.tsx` (Review Focus 1):

```tsx
import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { SignedOutNotice } from "@/components/states/signed-out-notice";
import { reportUnauthorized } from "./events";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

describe("session expiry", () => {
  it("signs out once for a burst of 401s, and says the session ended", async () => {
    renderWithAuth(<SignedOutNotice />);
    await act(async () => {
      reportUnauthorized();
      reportUnauthorized();
      reportUnauthorized();
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(screen.getByText("Your session ended")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/v1 lib/api/live.test.ts lib/auth/live.test.ts lib/auth/expiry.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the proxy route**

`app/api/v1/[...path]/route.ts`:

```ts
import { api, apiBase } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import {
  clearSession,
  readSession,
  writeSession,
  type ServerSession,
} from "@/lib/server/session";

const ALLOWED = new Set(["queries", "feedback", "corrections", "readyz"]);
const REFRESH_WITHIN_MS = 5 * 60_000;
const MAX_BODY = 64 * 1024;

async function refresh(s: ServerSession): Promise<ServerSession> {
  try {
    const r = await api<{ access_token: string; expires_in: number }>(
      "/auth/refresh",
      {
        method: "POST",
        token: s.token,
      },
    );
    const next = {
      ...s,
      token: r.access_token,
      expiresAt: Date.now() + r.expires_in * 1000,
    };
    await writeSession(next);
    return next;
  } catch {
    return s; // still valid for a few minutes; the next call tries again
  }
}

/** Same-origin proxy for clinical calls: adds the token the browser never sees. */
async function handle(req: Request, ctx: RouteContext<"/api/v1/[...path]">) {
  const { path } = await ctx.params;
  if (
    !ALLOWED.has(path[0] ?? "") ||
    path.some((p) => p === "" || p === "." || p === "..")
  )
    return json(404, { code: "not_found" });
  if (req.method !== "GET" && !sameOrigin(req)) return forbidden();

  let s = await readSession();
  if (!s) {
    await clearSession();
    return json(401, { code: "session_expired" });
  }
  if (s.expiresAt - Date.now() < REFRESH_WITHIN_MS) s = await refresh(s);

  const body = req.method === "GET" ? undefined : await req.text();
  if (body && Buffer.byteLength(body) > MAX_BODY)
    return json(413, { code: "too_large" });

  const url = `${apiBase()}/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${s.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body || undefined,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    return json(503, { code: "unavailable" });
  }
  if (res.status === 401) {
    await clearSession();
    return json(401, { code: "session_expired" });
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handle;
export const POST = handle;
```

The first test expects the forwarded headers to _equal_ `{Accept,
Authorization}` for a GET. That's why `Content-Type` is only spread in
when there's a body.

- [ ] **Step 4: Write the live clients and the expiry event**

`lib/api/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}
```

`lib/auth/events.ts`:

```ts
type Listener = () => void;
const listeners = new Set<Listener>();

/** Any live API call that finds the session gone reports it here. */
export function onUnauthorized(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function reportUnauthorized() {
  for (const fn of listeners) fn();
}
```

`lib/api/live.ts`:

```ts
import { reportUnauthorized } from "../auth/events";
import type { MhaiClient } from "./client";
import type { ClinicalResultOut, QueryStatusOut, Readiness } from "./contract";
import { ApiError } from "./errors";

/** The real API, through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): MhaiClient {
  async function call(path: string, method = "GET", body?: unknown) {
    let res: Response;
    try {
      res = await fetchImpl(`/api/v1${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers:
          body === undefined
            ? { Accept: "application/json" }
            : {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (res.status === 401) {
      reportUnauthorized();
      throw new ApiError(401, "session_expired");
    }
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { res, data };
  }
  async function ok<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const { res, data } = await call(path, method, body);
    if (!res.ok)
      throw new ApiError(
        res.status,
        typeof data?.code === "string" ? data.code : "error",
      );
    return data as T;
  }
  const id = encodeURIComponent;
  return {
    async createQuery(q) {
      const r = await ok<{ query_id: string }>("/queries", "POST", q);
      return { query_id: r.query_id };
    },
    getStatus: (q) => ok<QueryStatusOut>(`/queries/${id(q)}`),
    getResult: (q) => ok<ClinicalResultOut>(`/queries/${id(q)}/result`),
    sendFeedback: (f) => ok("/feedback", "POST", f),
    async getReadiness(): Promise<Readiness> {
      const { res, data } = await call("/readyz");
      if (res.ok) return { ok: true, degraded_services: [] };
      if (res.status === 503 && data)
        return {
          ok: false,
          degraded_services: Object.entries(data)
            .filter(([, up]) => up === false)
            .map(([name]) => name),
        };
      throw new ApiError(res.status, "error");
    },
  };
}
```

`lib/auth/live.ts`:

```ts
import {
  AuthError,
  type AuthClient,
  type AuthErrorCode,
  type Capabilities,
} from "./types";

/** Everything the backend design (gateway spec §4) doesn't include yet is off. */
export const LIVE_CAPABILITIES: Capabilities = {
  sso: false,
  emailLogin: false,
  passwordReset: false,
  devices: false,
  trustDevice: false,
};

const KNOWN = new Set<AuthErrorCode>([
  "invalid_credentials",
  "locked",
  "mfa_invalid",
  "mfa_expired",
  "rate_limited",
  "weak_password",
  "wrong_password",
  "link_expired",
  "session_expired",
  "unavailable",
]);
const unsupported = async (): Promise<never> => {
  throw new AuthError("unavailable");
};

export function createLiveAuthClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AuthClient {
  async function call<T>(
    path: string,
    body?: unknown,
    method = "POST",
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`/api/auth${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new AuthError("unavailable");
    }
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    const data = (await res.json().catch(() => null)) as {
      code?: string;
    } | null;
    throw new AuthError(
      KNOWN.has(data?.code as AuthErrorCode)
        ? (data!.code as AuthErrorCode)
        : "unavailable",
    );
  }

  return {
    capabilities: LIVE_CAPABILITIES,
    async getSession() {
      try {
        return await call("/session", undefined, "GET");
      } catch (e) {
        if (e instanceof AuthError && e.code === "session_expired") return null;
        throw e;
      }
    },
    signIn: (login, password) => call("/login", { login, password }),
    signInWithHospital: unsupported,
    verifyCode: (code, { backup, trustDevice }) =>
      call("/mfa", { code, backup, trustDevice }),
    async signOut() {
      await call("/logout").catch(() => {});
    },
    acceptTerms: () => call("/terms"),
    changePassword: (current, next) => call("/password", { current, next }),
    startMfaSetup: () => call("/mfa/setup"),
    confirmMfaSetup: (code) => call("/mfa/setup/confirm", { code }),
    requestPasswordReset: unsupported,
    resetPassword: unsupported,
    listDevices: unsupported,
    signOutDevice: unsupported,
    signOutEverywhere: unsupported,
  };
}
```

- [ ] **Step 5: Switch the client factories, listen for expiry, and stop 4xx retries**

`lib/api/client.ts`: replace `getClient` (and its doc comment) with:

```ts
/** Mock data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getClient(): MhaiClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockClient()
      : createLiveClient());
}
```

and add `import { createLiveClient } from "./live";`.

`lib/auth/client.ts`:

```ts
import { createLiveAuthClient } from "./live";
import { createMockAuthClient } from "./mock";
import type { AuthClient } from "./types";

let client: AuthClient | undefined;

/** The demo's sign-in when NEXT_PUBLIC_USE_MOCK=true; otherwise the BFF. */
export function getAuthClient(): AuthClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAuthClient()
      : createLiveAuthClient());
}
```

`lib/auth/auth-context.tsx`: import `onUnauthorized` from `./events`, and
add this after the `signOut` callback:

```tsx
// A live call found the session gone: sign out once, saying why.
useEffect(() => onUnauthorized(() => void signOut("expired")), [signOut]);
```

`app/providers.tsx`: import `ApiError` from `@/lib/api/errors`, and set:

```tsx
        defaultOptions: {
          queries: {
            // A 4xx won't change on retry (and a 401 has already signed out).
            retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 1,
            refetchOnWindowFocus: false,
          },
        },
```

`lib/api/mock.test.ts` has a Plan 1 test that expects `getClient()` to
throw `/Plan 2/` outside mock mode. Replace that test's body with:

```ts
vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
vi.resetModules();
const { getClient: fresh } = await import("./client");
const c = fresh();
for (const m of [
  "createQuery",
  "getStatus",
  "getResult",
  "sendFeedback",
  "getReadiness",
])
  expect(typeof (c as unknown as Record<string, unknown>)[m]).toBe("function");
vi.unstubAllEnvs();
```

Make the `it` callback `async`, and rename it to "uses the live client
outside mock mode". `resetModules` gives a fresh module, so the cached
mock client from the earlier test doesn't leak in.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: the build succeeds and lists the `ƒ /api/auth/*` and `ƒ
/api/v1/[...path]` routes.

- [ ] **Step 7: Commit**

```bash
npx prettier --write . && npm run lint && npm run typecheck
git add -A
git commit -m "Add the clinical API proxy and live clients, and sign out on expiry"
```

---

### Task 13: End-to-end acceptance, docs and the changelog

**Files:**

- Create: `tests/e2e/helpers.ts`, `tests/e2e/account.spec.ts`
- Modify: `tests/e2e/clinical-flow.spec.ts`, which uses the shared
  helpers; `README.md`; `CHANGELOG.md`.

**Interfaces:**

- Consumes: every screen from Tasks 3–9 in mock mode (the e2e server
  runs with `NEXT_PUBLIC_USE_MOCK=true`).
- Produces:
  - `signIn(page, email?)`;
  - `openAccountMenu(page)`, which opens the mobile drawer first on small
    screens;
  - `expectNoStorage(page)` and `expectNoForbiddenWords(page)`, moved out
    of `clinical-flow.spec.ts`.

Every `page.goto` is a full load, which starts a new, empty mock session.
So each test signs in after its first `goto`, then moves around in-app.

- [ ] **Step 1: Move the shared helpers**

Create `tests/e2e/helpers.ts`. Move into it from
`clinical-flow.spec.ts`:

- the `FORBIDDEN` regex;
- `isMobile`;
- `expectNoStorage`;
- `expectNoForbiddenWords`;
- Task 3's `signIn`.

Export them all. Make `signIn` take an optional email, and add
`openAccountMenu`:

```ts
export async function signIn(page: Page, email = "a.reyes@havanahospital.org") {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function openAccountMenu(page: Page) {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: /^Account:/ }).click();
}
```

In `clinical-flow.spec.ts`, import these. Its `fillForm` keeps
`await signIn(page);`, now followed by `await expect(page).toHaveURL(/\/$/);`,
because the helper no longer waits for home itself.

- [ ] **Step 2: Write the account acceptance tests**

`tests/e2e/account.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  expectNoForbiddenWords,
  expectNoStorage,
  openAccountMenu,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }) => {
  // No account details, codes or tokens in browser storage, ever.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

test("clinical pages need sign-in", async ({ page }) => {
  await page.goto("/help");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByLabel("Demo sign-in")).toBeVisible();
});

test("sign in, see your name, sign out from the account menu", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/welcome, dr\. reyes/i)).toBeVisible();
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText("You've signed out")).toBeVisible();
});

test("two-step code, including a wrong one first", async ({ page }) => {
  await signIn(page, "mfa.reyes@havanahospital.org");
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert")).toContainText("That code didn't work.");
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a deep link to the code step with nothing pending goes to sign-in", async ({
  page,
}) => {
  await page.goto("/sign-in/code");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("first sign-in: terms, password, two-step, backup codes", async ({
  page,
}) => {
  await signIn(page, "new.nurse@havanahospital.org");
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("I understand and agree to use MHAI this way").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("New password").fill("tram-lantern-okra");
  await page.getByLabel("Confirm password").fill("tram-lantern-okra");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("list", { name: "Backup codes" })).toBeVisible();
  await page.getByLabel("I've saved these codes somewhere safe").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("an admin account sees the 403 page, never the clinical app", async ({
  page,
}) => {
  await signIn(page, "admin@havanahospital.org");
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access" }),
  ).toBeVisible();
  await expect(page.getByText("Error 403")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("wrong passwords count down, and the message never confirms the account", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("x@havanahospital.org");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("That email and password don't match.");
  await expect(alert).toContainText("4 attempts left before a 15-minute lock.");
});

test("forgot password sends the same reply for any email", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot?" }).click();
  await page.getByLabel("Work email").fill("anyone@anywhere.org");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/anyone/);
});

test("profile and security, then sign out everywhere", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Attending physician")).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page
    .getByRole("dialog", { name: "Sign out everywhere?" })
    .getByRole("button", { name: "Sign out everywhere" })
    .click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("signing out mid-draft asks first", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /Start a consultation/ }).click();
  await page.getByLabel("Age").fill("54");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("dialog")).toContainText(/lost/);
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Age")).toHaveValue("54");
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `npx playwright test`
Expected: all clinical-flow and account tests PASS, on desktop and Pixel 7. If "signing out mid-draft" doesn't show the unsaved-draft dialog,
check that the account menu calls the shell's `navigate("/sign-out")`
(Task 9), not `router.push`.

- [ ] **Step 4: Update the README and the changelog**

`README.md`: under "Share the demo", after the first paragraph, add:

```markdown
The demo starts at a sign-in page (sample accounts, memory only, so a
reload signs you out). Any email and password works, and the two-step code
is `123456`. To see the other account screens, start the email with `mfa`
(two-step), `new` (first sign-in), `admin` (the 403 page) or `locked`, or
use the password `wrong`.
```

Add a section after "Share the demo":

```markdown
### Live mode

With `NEXT_PUBLIC_USE_MOCK` unset, the app talks to the MHAI API through
its own server routes (`/api/auth/*`, `/api/v1/*`). The API token is
sealed in an `httpOnly` cookie and never reaches browser JavaScript. Set:

- `MHAI_API_URL`: the API base, without `/api/v1`;
- `SESSION_SECRET`: at least 32 characters (`openssl rand -base64 48`);
- `NEXT_PUBLIC_ADMIN_APP_URL` (optional): where the 403 page's "Go to
  admin app" points.

The API itself is still being built (mhai-multiagent, gateway Plan 2).
Until it lands, use mock mode. Features its design doesn't include yet
(hospital single sign-on, email login, password reset, devices, "trust
this device") are hidden in live mode.
```

`CHANGELOG.md`: under _Unreleased_ → Added:

```markdown
- Sign-in and accounts (Plan 2, design v3), mock first: sign-in with
  generic errors and lockout warnings, two-step codes (paste, backup codes,
  trust this device), first sign-in (terms, new password, two-step setup,
  backup codes), forgot and reset password, the account menu, Profile &
  security (password, two-step, devices, sign out everywhere), and the 403
  page for non-clinician accounts.
- Server-side session (BFF): the API token lives in a sealed httpOnly
  cookie; clinical calls go through a same-origin `/api/v1` proxy with
  sliding refresh; an expired session signs out once with an explanation.
```

and under _Fixed_:

```markdown
- The signed-out notice now says why: inactivity, signing out yourself, or
  an ended session. It no longer says "inactivity" after a manual sign-out.
```

- [ ] **Step 5: Final checks and commit**

Run: `npm run lint && npm run typecheck && npm run format:check && npx vitest run && npm run build && npx playwright test`
Expected: all pass.

```bash
git add -A
git commit -m "Add account e2e tests and document sign-in and live mode"
```

---

## Self-review notes

- **Spec coverage (§5.5 Account):**
  - sign-in (OIDC first, then email and password, three trust points):
    Task 4;
  - two-step (six boxes, paste, backup code): Task 5;
  - sign-in error and lock warning: Task 4;
  - first sign-in (terms, two-step with QR, 10 backup codes with
    download, print and copy): Task 6;
  - password (forgot, check your email, new password with rule ticks,
    and "updated" signing out other devices): Task 7;
  - the account menu: Task 9;
  - Profile & security (locked records, two-step, password, devices, sign
    out everywhere): Task 9.
- **Deferred within §5.5:**
  - feedback stats and "My feedback" (Plan 3);
  - backup-code view and regeneration (backend §10 item 7);
  - "Request a change" (no backend; the page says to ask the hospital
    admin).
- **ARCHITECTURE §4.2–4.3:**
  - the BFF with the session in an `httpOnly` cookie and the token never
    in JavaScript: Tasks 10–12;
  - username and password with the MFA branch: Tasks 11–12;
  - refresh while active: Task 12;
  - the 13/15-minute idle sign-out: Plan 1, now wired to auth in Task 3;
  - the OIDC branch waits for backend Plan 3, and the capability hides
    it.
- **The 403 "wrong app"** from the plan's scope: Task 8. AuthGate
  coverage is in Task 3.
- **Types from OpenAPI:** blocked. The backend has no `openapi.json`
  (explained above in "Not in this plan").
