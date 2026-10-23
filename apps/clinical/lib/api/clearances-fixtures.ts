// The demo's sample clearance letters for Havana Hospital (Plan 11). Every
// name is invented. Dates are relative to the mock's clock, so the sample
// always has a letter ending soon, one ended, and so on.

import type {
  ClearanceEventOut,
  ClearanceOut,
  CoveredOut,
} from "./clearances-contract";

const D = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** A calendar day shifted by whole days: no time zone, no clock change. */
export function shiftDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const SIGNER = "Dr. Funmi Ade";
export const SIGNER_TITLE = "Chief Medical Director";

export const KEMI: CoveredOut = {
  id: "s-kemi",
  display_name: "Dr. Kemi Adeyemi",
};
export const GRACE: CoveredOut = { id: "s-nwosu", display_name: "Grace Nwosu" };
export const OBI: CoveredOut = { id: "s-obi", display_name: "Dr. Obi" };
export const EZE: CoveredOut = { id: "s-eze", display_name: "Dr. Eze" };

/** The platform admins a hospital may name in a letter, by email. */
export const PLATFORM_ADMINS: Record<string, CoveredOut> = {
  "ada.bakare@measured-health.example": {
    id: "pa_ada",
    display_name: "Ada Bakare",
  },
  "tunde.okafor@measured-health.example": {
    id: "pa_tunde",
    display_name: "Tunde Okafor",
  },
  "bola.hassan@measured-health.example": {
    id: "pa_bola",
    display_name: "Bola Hassan",
  },
};
export const TUNDE = PLATFORM_ADMINS["tunde.okafor@measured-health.example"]!;

const grace = { display_name: GRACE.display_name };
const tunde = { display_name: TUNDE.display_name };

const uploaded = (at: number): ClearanceEventOut => ({
  at: iso(at),
  kind: "uploaded",
  by: grace,
  side: "hospital",
  reason: null,
  note: null,
});
const ready = (at: number): ClearanceEventOut => ({
  at: iso(at),
  kind: "ready",
  by: null,
  side: null,
  reason: null,
  note: null,
});
const verified = (at: number): ClearanceEventOut => ({
  at: iso(at),
  kind: "verified",
  by: tunde,
  side: "platform",
  reason: null,
  note: null,
});

function letter(
  over: Partial<ClearanceOut> & Pick<ClearanceOut, "id">,
): ClearanceOut {
  return {
    status: "waiting",
    refused_reason: null,
    signed_by: SIGNER,
    signer_title: SIGNER_TITLE,
    letter_date: "",
    covered: [],
    covered_platform: [],
    end_date: "",
    uploaded_by: grace,
    uploaded_at: "",
    verified_by: null,
    verified_at: null,
    rejection: null,
    revocation: null,
    renews: null,
    pages: 0,
    history: [],
    version: 1,
    ...over,
  };
}

/**
 * The sample letters, one in every status, newest first. `today` is the
 * hospital's day (`Africa/Lagos`, worked out by the mock).
 */
export function sampleClearances(now: number, today: string): ClearanceOut[] {
  const up = (days: number) => now - days * D;
  return [
    letter({
      id: "cl_check",
      status: "checking",
      letter_date: shiftDay(today, -1),
      covered: [KEMI],
      end_date: shiftDay(today, 180),
      uploaded_at: iso(now - 1000),
      history: [uploaded(now - 1000)],
    }),
    letter({
      id: "cl_bad",
      status: "refused",
      refused_reason: "failed_safety_check",
      letter_date: shiftDay(today, -2),
      covered: [GRACE],
      end_date: shiftDay(today, 150),
      uploaded_at: iso(up(0.1)),
      history: [
        uploaded(up(0.1)),
        {
          at: iso(up(0.1) + 4000),
          kind: "refused",
          by: null,
          side: null,
          reason: "failed_safety_check",
          note: null,
        },
      ],
    }),
    letter({
      id: "cl_wait",
      status: "waiting",
      letter_date: shiftDay(today, -4),
      covered: [OBI],
      covered_platform: [TUNDE],
      end_date: shiftDay(today, 120),
      uploaded_at: iso(up(3)),
      pages: 3,
      history: [uploaded(up(3)), ready(up(3) + 6000)],
    }),
    letter({
      id: "cl_act",
      status: "active",
      letter_date: shiftDay(today, -30),
      covered: [GRACE],
      end_date: shiftDay(today, 137),
      uploaded_at: iso(up(25)),
      verified_by: tunde,
      verified_at: iso(up(24)),
      pages: 2,
      history: [uploaded(up(25)), ready(up(25) + 6000), verified(up(24))],
    }),
    letter({
      id: "cl_soon",
      status: "active",
      letter_date: shiftDay(today, -340),
      covered: [KEMI],
      end_date: shiftDay(today, 12),
      uploaded_at: iso(up(335)),
      verified_by: tunde,
      verified_at: iso(up(334)),
      pages: 2,
      history: [
        uploaded(up(335)),
        ready(up(335) + 6000),
        verified(up(334)),
        {
          at: iso(up(18)),
          kind: "reminded",
          by: null,
          side: null,
          reason: "30_days",
          note: null,
        },
      ],
    }),
    letter({
      id: "cl_rej",
      status: "rejected",
      letter_date: shiftDay(today, -45),
      covered: [KEMI],
      end_date: shiftDay(today, 200),
      uploaded_at: iso(up(40)),
      rejection: {
        reason: "end_date_mismatch",
        note: null,
        at: iso(up(38)),
      },
      pages: 2,
      history: [
        uploaded(up(40)),
        ready(up(40) + 6000),
        {
          at: iso(up(38)),
          kind: "rejected",
          by: tunde,
          side: "platform",
          reason: "end_date_mismatch",
          note: null,
        },
      ],
    }),
    letter({
      id: "cl_end",
      status: "ended",
      letter_date: shiftDay(today, -430),
      covered: [GRACE],
      end_date: shiftDay(today, -60),
      uploaded_at: iso(up(425)),
      verified_by: tunde,
      verified_at: iso(up(424)),
      pages: 2,
      history: [
        uploaded(up(425)),
        ready(up(425) + 6000),
        verified(up(424)),
        {
          at: iso(up(59)),
          kind: "ended",
          by: null,
          side: null,
          reason: null,
          note: null,
        },
      ],
    }),
    letter({
      id: "cl_rev",
      status: "revoked",
      letter_date: shiftDay(today, -90),
      covered: [EZE],
      end_date: shiftDay(today, 100),
      uploaded_at: iso(up(85)),
      verified_by: tunde,
      verified_at: iso(up(84)),
      revocation: {
        by: grace,
        side: "hospital",
        at: iso(up(20)),
        reason: "person_left",
        note: null,
      },
      pages: 2,
      history: [
        uploaded(up(85)),
        ready(up(85) + 6000),
        verified(up(84)),
        {
          at: iso(up(20)),
          kind: "revoked",
          by: grace,
          side: "hospital",
          reason: "person_left",
          note: null,
        },
      ],
    }),
  ];
}
