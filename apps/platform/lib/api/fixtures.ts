// The platform demo's sample data. Every hospital and person is invented;
// the names are not drawn from real organisations. Havana Hospital is the
// clinical demo's own (invented) hospital, so the two demos line up. No
// patient data.
import type {
  ActivityEvent,
  Hospital,
  Person,
  SsoOut,
  TeamMember,
} from "./contract";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
export const INVITE_MS = 7 * D;
const iso = (ms: number) => new Date(ms).toISOString();

/** The Measured Health team's sample sign-ins. */
export const TEAM_EMAILS = {
  ada: "ada.bakare@measured-health.example",
  tunde: "tunde.okafor@measured-health.example",
  amara: "amara.eze@measured-health.example",
  kemi: "kemi.lawal@measured-health.example",
  /** A new platform admin: first sign-in steps, then two-step setup. */
  newAdmin: "new.admin@measured-health.example",
} as const;

const ADA: Person = { id: "tm_ada", name: "Ada Bakare" };
const TUNDE: Person = { id: "tm_tunde", name: "Tunde Okafor" };

/**
 * A hospital as the sample API keeps it: what it returns, plus what the
 * removal checks read (legal holds, records retention, the data export).
 */
export type HospitalRecord = {
  hospital: Hospital;
  /**
   * The hospital's admin accounts. `hospital.admins` lists them while the
   * hospital is active; nobody can sign in to act anywhere else.
   */
  admins: Hospital["admins"];
  sso: SsoOut;
  legal_holds: number;
  retention_until: string | null;
  export_required: boolean;
  export_done: boolean;
};

const NO_SSO: SsoOut = {
  enabled: false,
  sign_in_url: null,
  client_id: null,
  issuer: null,
  allowed_domains: [],
  secret_saved: false,
  secret_ends: null,
  last_test: null,
  version: 1,
};

export function seedTeam(now: number): TeamMember[] {
  const m = (
    p: Person,
    email: string,
    role: TeamMember["role"],
    lastAgo: number | null,
    pending = false,
  ): TeamMember => ({
    ...p,
    email,
    role,
    status: pending ? "invite_pending" : "active",
    mfa_enabled: !pending,
    last_sign_in_at: lastAgo === null ? null : iso(now - lastAgo),
    is_you: false,
    version: 1,
  });
  return [
    m(ADA, TEAM_EMAILS.ada, "platform_admin", 5 * MIN),
    m(TUNDE, TEAM_EMAILS.tunde, "platform_admin", D),
    m(
      { id: "tm_amara", name: "Amara Eze" },
      TEAM_EMAILS.amara,
      "auditor",
      3 * D,
    ),
    m(
      { id: "tm_kemi", name: "Kemi Lawal" },
      TEAM_EMAILS.kemi,
      "auditor",
      null,
      true,
    ),
    // Active but not set up: the demo's first sign-in. The sample team
    // never records the setup, so this admin repeats the welcome flow on
    // every sign-in in a tab, on purpose, so the demo is repeatable.
    {
      ...m(
        { id: "tm_new", name: "Chidi Nwosu" },
        TEAM_EMAILS.newAdmin,
        "platform_admin",
        null,
      ),
      mfa_enabled: false,
    },
  ];
}

export function seedHospitals(now: number): HospitalRecord[] {
  const base = (
    id: string,
    name: string,
    short_code: string,
    domain: string,
    over: Partial<Hospital>,
  ): Hospital => ({
    id,
    name,
    short_code,
    status: "active",
    staff_count: 0,
    sso_enabled: false,
    created_at: iso(now - 300 * D),
    last_activity_at: null,
    country: "NG",
    time_zone: "Africa/Lagos",
    email_domains: [domain],
    version: 1,
    deactivation: null,
    first_admin: null,
    removal: null,
    admins: [],
    ...over,
  });
  const accepted = (
    invite_id: string,
    name: string,
    email: string,
    sentAgo: number,
  ): Hospital["first_admin"] => ({
    invite_id,
    name,
    email,
    status: "accepted",
    sent_at: iso(now - sentAgo),
    expires_at: iso(now - sentAgo + INVITE_MS),
  });
  const clear = {
    legal_holds: 0,
    retention_until: null,
    export_required: false,
    export_done: false,
  };
  const admin = (name: string, email: string) => ({ name, email });
  return [
    {
      hospital: base(
        "h_havana",
        "Havana Hospital",
        "HAVANA",
        "havanahospital.org",
        {
          staff_count: 186,
          created_at: iso(now - 500 * D),
          last_activity_at: iso(now - 4 * MIN),
          first_admin: accepted(
            "inv_havana1",
            "Grace Nwosu",
            "admin.nwosu@havanahospital.org",
            500 * D,
          ),
        },
      ),
      admins: [
        admin("Grace Nwosu", "admin.nwosu@havanahospital.org"),
        admin("Dr. Ngozi Obi", "director.obi@havanahospital.org"),
      ],
      sso: NO_SSO,
      ...clear,
    },
    {
      hospital: base(
        "h_northgate",
        "Northgate General Hospital",
        "NGH",
        "northgate.example",
        {
          staff_count: 214,
          sso_enabled: true,
          created_at: iso(now - 400 * D),
          last_activity_at: iso(now - 12 * MIN),
          first_admin: accepted(
            "inv_northgate1",
            "Ifeoma Nnaji",
            "ifeoma.nnaji@northgate.example",
            400 * D,
          ),
        },
      ),
      sso: {
        enabled: true,
        sign_in_url: "https://sso.northgate.example/start",
        client_id: "measured-health",
        issuer: "https://sso.northgate.example",
        allowed_domains: ["northgate.example"],
        secret_saved: true,
        secret_ends: "3f2a",
        last_test: {
          at: iso(now - 3 * D),
          ok: true,
          message: "Sign-in works.",
        },
        version: 1,
      },
      admins: [
        admin("Ifeoma Nnaji", "ifeoma.nnaji@northgate.example"),
        admin("Emeka Udoh", "emeka.udoh@northgate.example"),
      ],
      ...clear,
    },
    {
      hospital: base(
        "h_riverside",
        "Riverside Children's Hospital",
        "RCH",
        "riverside-children.example",
        {
          staff_count: 96,
          created_at: iso(now - 250 * D),
          last_activity_at: iso(now - 2 * H),
          first_admin: accepted(
            "inv_riverside1",
            "Musa Danjuma",
            "musa.danjuma@riverside-children.example",
            250 * D,
          ),
        },
      ),
      admins: [
        admin("Musa Danjuma", "musa.danjuma@riverside-children.example"),
      ],
      sso: NO_SSO,
      ...clear,
    },
    {
      hospital: base(
        "h_eastbrook",
        "Eastbrook Medical Centre",
        "EMC",
        "eastbrook.example",
        {
          status: "setup_incomplete",
          created_at: iso(now - 9 * D - MIN),
          // Sent 9 days ago and never accepted: it has expired.
          first_admin: {
            invite_id: "inv_eastbrook1",
            name: "Chiamaka Obi",
            email: "chiamaka.obi@eastbrook.example",
            status: "expired",
            sent_at: iso(now - 9 * D),
            expires_at: iso(now - 9 * D + INVITE_MS),
          },
        },
      ),
      admins: [],
      sso: NO_SSO,
      ...clear,
    },
    {
      hospital: base(
        "h_westfield",
        "Westfield Clinic",
        "WFC",
        "westfield.example",
        {
          status: "deactivated",
          staff_count: 41,
          created_at: iso(now - 700 * D),
          last_activity_at: iso(now - 40 * D),
          first_admin: accepted(
            "inv_westfield1",
            "Yemi Afolabi",
            "yemi.afolabi@westfield.example",
            700 * D,
          ),
          deactivation: {
            by: TUNDE,
            at: iso(now - 40 * D),
            reason: "contract_ended",
            note: null,
          },
        },
      ),
      admins: [admin("Yemi Afolabi", "yemi.afolabi@westfield.example")],
      sso: NO_SSO,
      // The records retention period has passed.
      ...clear,
      retention_until: iso(now - 10 * D),
    },
    {
      hospital: base(
        "h_harbour",
        "Harbour View Hospital",
        "HVH",
        "harbourview.example",
        {
          status: "removal_pending",
          staff_count: 133,
          created_at: iso(now - 900 * D),
          last_activity_at: iso(now - 30 * D),
          first_admin: accepted(
            "inv_harbour1",
            "Bisi Coker",
            "bisi.coker@harbourview.example",
            900 * D,
          ),
          deactivation: {
            by: TUNDE,
            at: iso(now - 30 * D),
            reason: "hospital_request",
            note: null,
          },
          removal: {
            status: "requested",
            requested_by: TUNDE,
            requested_by_you: false,
            requested_at: iso(now - D),
            reason: "The hospital closed in June.",
            approved_by: null,
            approved_at: null,
            checks: {
              legal_holds: 1,
              retention_until: null,
              export_required: true,
              export_done: true,
            },
            blocking: ["legal_hold"],
          },
        },
      ),
      admins: [admin("Bisi Coker", "bisi.coker@harbourview.example")],
      sso: NO_SSO,
      legal_holds: 1,
      retention_until: null,
      export_required: true,
      export_done: true,
    },
    {
      hospital: base(
        "h_southpoint",
        "Southpoint Hospital",
        "SPH",
        "southpoint.example",
        {
          status: "removal_pending",
          staff_count: 58,
          created_at: iso(now - 800 * D),
          last_activity_at: iso(now - 60 * D),
          first_admin: accepted(
            "inv_southpoint1",
            "Tobi Adeyemi",
            "tobi.adeyemi@southpoint.example",
            800 * D,
          ),
          deactivation: {
            by: ADA,
            at: iso(now - 60 * D),
            reason: "contract_ended",
            note: null,
          },
          removal: {
            status: "requested",
            requested_by: TUNDE,
            requested_by_you: false,
            requested_at: iso(now - 2 * H),
            reason: "Contract ended; the data export was delivered.",
            approved_by: null,
            approved_at: null,
            checks: {
              legal_holds: 0,
              retention_until: null,
              export_required: true,
              export_done: true,
            },
            blocking: [],
          },
        },
      ),
      admins: [admin("Tobi Adeyemi", "tobi.adeyemi@southpoint.example")],
      sso: NO_SSO,
      legal_holds: 0,
      retention_until: null,
      export_required: true,
      export_done: true,
    },
    {
      // A small clinic: its analytics counts are 1–4, so they are hidden.
      hospital: base(
        "h_lakeside",
        "Lakeside Community Clinic",
        "LCC",
        "lakeside-clinic.example",
        {
          staff_count: 23,
          created_at: iso(now - 180 * D),
          last_activity_at: iso(now - 3 * D),
          first_admin: accepted(
            "inv_lakeside1",
            "Halima Yusuf",
            "halima.yusuf@lakeside-clinic.example",
            180 * D,
          ),
        },
      ),
      admins: [admin("Halima Yusuf", "halima.yusuf@lakeside-clinic.example")],
      sso: NO_SSO,
      ...clear,
    },
    {
      // Active for 9 days, nobody asking yet: zeros, no previous period.
      hospital: base(
        "h_hilltop",
        "Hilltop Cottage Hospital",
        "HCH",
        "hilltop.example",
        {
          staff_count: 12,
          created_at: iso(now - 10 * D),
          first_admin: accepted(
            "inv_hilltop1",
            "Kunle Bello",
            "kunle.bello@hilltop.example",
            10 * D,
          ),
        },
      ),
      admins: [admin("Kunle Bello", "kunle.bello@hilltop.example")],
      sso: NO_SSO,
      ...clear,
    },
  ].map((r) => ({
    ...r,
    hospital: {
      ...r.hospital,
      admins: r.hospital.status === "active" ? r.admins : [],
    },
  }));
}

/** 12 past events, newest first. */
export function seedActivity(now: number): ActivityEvent[] {
  const hosp = (id: string, name: string): Person => ({ id, name });
  const NGH = hosp("h_northgate", "Northgate General Hospital");
  const RCH = hosp("h_riverside", "Riverside Children's Hospital");
  const EMC = hosp("h_eastbrook", "Eastbrook Medical Centre");
  const WFC = hosp("h_westfield", "Westfield Clinic");
  const HVH = hosp("h_harbour", "Harbour View Hospital");
  const SPH = hosp("h_southpoint", "Southpoint Hospital");
  const rows: [
    number,
    Person,
    ActivityEvent["action"],
    Person | null,
    string | null,
    string | null,
  ][] = [
    [
      2 * H,
      TUNDE,
      "removal_requested",
      SPH,
      null,
      "Contract ended; the data export was delivered.",
    ],
    [D, TUNDE, "removal_requested", HVH, null, "The hospital closed in June."],
    [3 * D, ADA, "sso_tested", NGH, null, "Sign-in works."],
    [3 * D + 5 * MIN, ADA, "sso_updated", NGH, null, null],
    [4 * D, ADA, "team_invited", null, TEAM_EMAILS.kemi, "Auditor"],
    [9 * D, ADA, "admin_invited", EMC, "chiamaka.obi@eastbrook.example", null],
    [9 * D + MIN, ADA, "hospital_added", EMC, null, null],
    [
      30 * D,
      TUNDE,
      "hospital_deactivated",
      HVH,
      null,
      "At the hospital's request",
    ],
    [40 * D, TUNDE, "hospital_deactivated", WFC, null, "Contract ended"],
    [60 * D, ADA, "hospital_deactivated", SPH, null, "Contract ended"],
    [90 * D, ADA, "team_role_changed", null, "Amara Eze", "Auditor"],
    [120 * D, TUNDE, "hospital_updated", RCH, null, "Email domains"],
  ];
  return rows.map(([ago, actor, action, hospital, target, detail], i) => ({
    id: `ev_${String(i + 1).padStart(3, "0")}`,
    at: iso(now - ago),
    actor,
    action,
    hospital,
    target,
    detail,
  }));
}
