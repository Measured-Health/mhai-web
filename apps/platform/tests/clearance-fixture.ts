import type { Clearance } from "@/lib/api/clearances-contract";

/** A bare waiting letter for the rules' tests; override what matters. */
export const letter = (over: Partial<Clearance> = {}): Clearance => ({
  id: "cl_1",
  hospital: { id: "h_havana", name: "Havana Hospital" },
  status: "waiting",
  refused_reason: null,
  signed_by: "Ngozi Eze",
  signer_title: "CEO",
  letter_date: "2026-09-01",
  covered: [
    { id: "s1", name: "Kemi" },
    { id: "s2", name: "Obi" },
  ],
  covered_platform: [{ id: "tm1", name: "Ada Bakare" }],
  covers_you: false,
  end_date: "2027-03-12",
  uploaded_by: { id: "s1", name: "Kemi" },
  uploaded_at: "2026-10-20T09:00:00Z",
  ready_at: "2026-10-20T10:00:00Z",
  verified_by: null,
  verified_at: null,
  rejection: null,
  revocation: null,
  pages: 1,
  history: [],
  today: "2026-10-23",
  verifiable_by_you: true,
  version: 1,
  ...over,
});
