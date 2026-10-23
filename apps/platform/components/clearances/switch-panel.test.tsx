import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { Signoffs } from "@/lib/api/clearances-contract";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import type { User } from "@/lib/auth/types";
import { FILL_IN } from "@/lib/clearances/switch";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { SwitchPanel } from "./switch-panel";

const env = vi.hoisted(() => ({ online: true, desktop: true }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clearances",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => env.online }));
vi.mock("@mhai/ui/hooks/use-media", () => ({
  useIsDesktop: () => env.desktop,
}));

const TUNDE: User = {
  ...ADA,
  id: "tunde.okafor",
  email: TEAM_EMAILS.tunde,
  name: "Tunde Okafor",
};

const RIVER = "Riverside Children's Hospital";
const WAITING = "Waiting for a different platform admin to approve";
const SAME_PERSON =
  "You asked for this change, so a different platform admin must approve it";
const ABOVE_GLOBAL =
  "A hospital can't be turned higher than every hospital's switch";
const RAISE_INTRO =
  "A different platform admin must approve before this takes effect.";
const LOWER_INTRO =
  "This takes effect at once and ends every named view on screen.";

const SIGNOFFS: Signoffs = {
  clinical: {
    by: "Dr. A. Musa, Clinical lead",
    at: "2026-10-01",
    ref: "CS-030",
  },
  privacy: { by: "N. Eke, Data protection", at: "2026-10-02", ref: "PR-019" },
  legal: { by: "B. Adeyemi, Legal counsel", at: "2026-10-03", ref: "LG-044" },
};

let api: PlatformClient;
let qc: QueryClient;
let me: User;

/** One demo for the whole test: who is signed in can change. */
function install() {
  api = createMockPlatform({
    delayMs: 0,
    me: () => me.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
}

/** Signs `user` in and shows the panel, on a fresh cache. */
async function show(user: User = ADA) {
  cleanup();
  me = user;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderWithAuth(<SwitchPanel />, { user, queryClient: qc });
  return screen.findByRole("region", { name: "Named access" });
}

beforeEach(() => {
  me = ADA;
  install();
});
afterEach(() => {
  env.online = true;
  env.desktop = true;
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const panel = () => screen.getByRole("region", { name: "Named access" });
const scope = (name: string) => within(panel()).getByRole("group", { name });
const global = () => scope("Every hospital");
/** The words after a fact's label ("Own switch", "In effect"). */
const fact = (el: HTMLElement, term: string) =>
  within(el).getByText(term).nextElementSibling?.textContent;
const status = () => within(panel()).getByRole("status");
const holding = (code: string) =>
  qc
    .getMutationCache()
    .getAll()
    .filter((m) => JSON.stringify(m.state.variables ?? {}).includes(code));
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

/** Fills the three sign-off groups of the raise form. */
async function fillSignoffs(d: HTMLElement, s: Partial<Signoffs> = SIGNOFFS) {
  for (const [kind, label] of [
    ["clinical", "Clinical"],
    ["privacy", "Privacy"],
    ["legal", "Legal"],
  ] as const) {
    const g = within(d).getByRole("group", { name: label });
    const o = s[kind];
    if (o?.by)
      await userEvent.type(
        within(g).getByLabelText("Signed by (name and role)"),
        o.by,
      );
    if (o?.at)
      fireEvent.change(within(g).getByLabelText("Date"), {
        target: { value: o.at },
      });
    if (o?.ref)
      await userEvent.type(
        within(g).getByLabelText("Document reference"),
        o.ref,
      );
  }
}

/** Ada asks for Letters only at Riverside, straight to the mock. */
async function askRiverside() {
  const s = await api.getNamedAccess();
  const river = s.hospitals.find((h) => h.hospital.id === "h_riverside")!;
  await api.requestNamedAccess(
    {
      hospital: "h_riverside",
      position: "letters_only",
      signoffs: SIGNOFFS,
      version: river.version,
      mfa_code: MOCK_CODE,
    },
    { idempotencyKey: crypto.randomUUID() },
  );
}

describe("the positions", () => {
  it("shows On since … · requested by Ada Bakare, approved by Tunde Okafor", async () => {
    await show();
    const g = global();
    expect(within(g).getByText("On")).toBeInTheDocument();
    expect(g.querySelector("[data-position='on'] svg")).not.toBeNull();
    expect(
      within(g).getByText(
        /^On since \d{1,2} [A-Z][a-z]{2} \d{4} · requested by Ada Bakare, approved by Tunde Okafor$/,
      ),
    ).toBeInTheDocument();
  });

  it("Havana On and Northgate Off, with effective positions", async () => {
    await show();
    const havana = scope("Havana Hospital");
    expect(fact(havana, "Own switch")).toBe("On");
    expect(fact(havana, "In effect")).toBe("On");
    const north = scope("Northgate General Hospital");
    expect(fact(north, "Own switch")).toBe("Off");
    expect(fact(north, "In effect")).toBe("Off");
    expect(
      within(panel()).queryByText("Limited by the global switch"),
    ).toBeNull();
  });

  it("a hospital above the global position reads Limited by the global switch", async () => {
    me = TUNDE;
    const s = await api.getNamedAccess();
    await api.lowerNamedAccess(
      {
        hospital: null,
        position: "letters_only",
        reason: "Pilot only",
        version: s.global.version,
        mfa_code: MOCK_CODE,
      },
      { idempotencyKey: crypto.randomUUID() },
    );
    await show();
    const havana = scope("Havana Hospital");
    expect(fact(havana, "Own switch")).toBe("On");
    expect(fact(havana, "In effect")).toBe("Letters only");
    expect(
      within(havana).getByText("Limited by the global switch"),
    ).toBeInTheDocument();
  });
});

describe("turning up", () => {
  it("Ada requests Letters only for Riverside with three sign-offs and a code; it shows as waiting", async () => {
    const ask = vi.spyOn(api, "requestNamedAccess");
    await show();
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Turn up" }),
    );
    const form = screen.getByRole("dialog", {
      name: `Turn up named access for ${RIVER}`,
    });
    expect(within(form).getByText(RAISE_INTRO)).toBeInTheDocument();
    // Riverside is Off and global is On: Letters only and On are offered.
    await userEvent.click(
      within(form).getByRole("radio", { name: "Letters only" }),
    );
    await fillSignoffs(form);
    await userEvent.click(
      within(form).getByRole("button", { name: "Continue" }),
    );

    const d = await screen.findByRole("dialog", {
      name: `Ask to turn named access for ${RIVER} Letters only?`,
    });
    expect(within(d).getByText(RAISE_INTRO)).toBeInTheDocument();
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Ask for approval" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ask).toHaveBeenCalledWith(
      {
        hospital: "h_riverside",
        position: "letters_only",
        signoffs: SIGNOFFS,
        version: 1,
        mfa_code: MOCK_CODE,
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    const river = scope(RIVER);
    expect(
      within(river).getByText(/^Ada Bakare asked to turn it Letters only · /),
    ).toBeInTheDocument();
    expect(within(river).getByText(WAITING)).toBeInTheDocument();
    expect(fact(river, "Own switch")).toBe("Off");
    expect(within(river).queryByRole("button", { name: "Turn up" })).toBeNull();
    // The focus goes to the panel's status line, which says what happened.
    expect(status()).toHaveFocus();
    expect(status()).toHaveTextContent(
      `Asked to turn named access for ${RIVER} Letters only. ${WAITING}`,
    );
    expect(holding(MOCK_CODE)).toEqual([]);
  });

  it("a missing legal reference blocks the request", async () => {
    const ask = vi.spyOn(api, "requestNamedAccess");
    await show();
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Turn up" }),
    );
    const form = screen.getByRole("dialog", {
      name: `Turn up named access for ${RIVER}`,
    });
    await userEvent.click(
      within(form).getByRole("radio", { name: "Letters only" }),
    );
    await fillSignoffs(form, {
      ...SIGNOFFS,
      legal: { ...SIGNOFFS.legal, ref: "" },
    });
    await userEvent.click(
      within(form).getByRole("button", { name: "Continue" }),
    );
    expect(within(form).getByText(FILL_IN)).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it("a 409 signoff_missing from the server reads the same words, back on the form", async () => {
    vi.spyOn(api, "requestNamedAccess").mockRejectedValue(
      new ApiError(409, "signoff_missing"),
    );
    await show();
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Turn up" }),
    );
    const form = screen.getByRole("dialog", { name: /^Turn up/ });
    await userEvent.click(within(form).getByRole("radio", { name: "On" }));
    await fillSignoffs(form);
    await userEvent.click(
      within(form).getByRole("button", { name: "Continue" }),
    );
    const d = await screen.findByRole("dialog", { name: /^Ask to turn/ });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Ask for approval" }),
    );
    const back = await screen.findByRole("dialog", { name: /^Turn up/ });
    expect(within(back).getByText(FILL_IN)).toBeInTheDocument();
    expect(holding(MOCK_CODE)).toEqual([]);
  });

  it("a hospital can't be offered a position above global", async () => {
    me = TUNDE;
    const s = await api.getNamedAccess();
    await api.lowerNamedAccess(
      {
        hospital: null,
        position: "letters_only",
        reason: "Pilot only",
        version: s.global.version,
        mfa_code: MOCK_CODE,
      },
      { idempotencyKey: crypto.randomUUID() },
    );
    await show();
    // Havana is On, above global: nothing higher to offer.
    expect(
      within(scope("Havana Hospital")).queryByRole("button", {
        name: "Turn up",
      }),
    ).toBeNull();
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Turn up" }),
    );
    const form = screen.getByRole("dialog", { name: /^Turn up/ });
    expect(
      within(form)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(["letters_only"]);
    expect(
      within(form).getByRole("radio", { name: "Letters only" }),
    ).toBeChecked();
  });

  it("a 409 above_global reads its own words in the status line", async () => {
    vi.spyOn(api, "requestNamedAccess").mockRejectedValue(
      new ApiError(409, "above_global"),
    );
    await show();
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Turn up" }),
    );
    const form = screen.getByRole("dialog", { name: /^Turn up/ });
    await userEvent.click(within(form).getByRole("radio", { name: "On" }));
    await fillSignoffs(form);
    await userEvent.click(
      within(form).getByRole("button", { name: "Continue" }),
    );
    const d = await screen.findByRole("dialog", { name: /^Ask to turn/ });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Ask for approval" }),
    );
    await waitFor(() => expect(status()).toHaveTextContent(ABOVE_GLOBAL));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(status()).toHaveFocus();
  });

  it("a stale request shows Changed by someone else", async () => {
    await show();
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Turn up" }),
    );
    // Someone else asks first: the version Ada saw is now old.
    me = TUNDE;
    await askRiverside();
    me = ADA;
    const form = screen.getByRole("dialog", { name: /^Turn up/ });
    await userEvent.click(within(form).getByRole("radio", { name: "On" }));
    await fillSignoffs(form);
    await userEvent.click(
      within(form).getByRole("button", { name: "Continue" }),
    );
    const d = await screen.findByRole("dialog", { name: /^Ask to turn/ });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Ask for approval" }),
    );
    await waitFor(() =>
      expect(status()).toHaveTextContent("Changed by someone else"),
    );
    // Loaded again: Tunde's request shows.
    await within(scope(RIVER)).findByText(/^Tunde Okafor asked to turn it/);
  });
});

describe("approving and cancelling", () => {
  it("Ada sees no Approve on her own request; Tunde approves and it takes effect", async () => {
    await askRiverside();
    await show(ADA);
    let river = scope(RIVER);
    expect(within(river).getByText(WAITING)).toBeInTheDocument();
    expect(within(river).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(
      within(river).getByRole("button", { name: "Cancel request" }),
    ).toBeInTheDocument();

    const approve = vi.spyOn(api, "approveNamedAccess");
    await show(TUNDE);
    river = scope(RIVER);
    expect(within(river).queryByText(WAITING)).toBeNull();
    await userEvent.click(
      within(river).getByRole("button", { name: "Approve" }),
    );
    const d = screen.getByRole("dialog", {
      name: `Approve named access for ${RIVER}: Letters only?`,
    });
    // The request's sign-offs, to check before approving.
    for (const ref of ["CS-030", "PR-019", "LG-044"])
      expect(within(d).getByText(new RegExp(ref))).toBeInTheDocument();
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(approve).toHaveBeenCalledWith(
      expect.any(String),
      { version: 2, mfa_code: MOCK_CODE },
      expect.anything(),
    );
    river = scope(RIVER);
    expect(fact(river, "Own switch")).toBe("Letters only");
    expect(fact(river, "In effect")).toBe("Letters only");
    expect(status()).toHaveTextContent(
      `Named access for ${RIVER} is now Letters only`,
    );
    expect(status()).toHaveFocus();
    expect(holding(MOCK_CODE)).toEqual([]);
  });

  it("a forced same_person on approval reads its own words", async () => {
    await askRiverside();
    vi.spyOn(api, "approveNamedAccess").mockRejectedValue(
      new ApiError(409, "same_person"),
    );
    await show(TUNDE);
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Approve" }),
    );
    const d = screen.getByRole("dialog", { name: /^Approve/ });
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(status()).toHaveTextContent(SAME_PERSON));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancel a pending request", async () => {
    await askRiverside();
    const cancel = vi.spyOn(api, "cancelNamedAccess");
    await show(TUNDE);
    await userEvent.click(
      within(scope(RIVER)).getByRole("button", { name: "Cancel request" }),
    );
    await waitFor(() =>
      expect(within(scope(RIVER)).queryByText(/asked to turn it/)).toBeNull(),
    );
    expect(cancel).toHaveBeenCalledWith(
      expect.any(String),
      { version: 2 },
      expect.anything(),
    );
    expect(status()).toHaveTextContent("Request cancelled");
    expect(status()).toHaveFocus();
    expect(
      within(scope(RIVER)).getByRole("button", { name: "Turn up" }),
    ).toBeInTheDocument();
  });
});

describe("turning down", () => {
  it("turning global down to Letters only takes effect at once with one admin", async () => {
    const lower = vi.spyOn(api, "lowerNamedAccess");
    await show();
    await userEvent.click(
      within(global()).getByRole("button", { name: "Turn down" }),
    );
    const form = screen.getByRole("dialog", {
      name: "Turn down named access for every hospital",
    });
    await userEvent.click(
      within(form).getByRole("radio", { name: "Letters only" }),
    );
    await userEvent.click(
      within(form).getByRole("button", { name: "Continue" }),
    );
    const d = await screen.findByRole("dialog", {
      name: "Turn named access for every hospital down to Letters only?",
    });
    expect(within(d).getByText(LOWER_INTRO)).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Pilot only");
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Turn down" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lower).toHaveBeenCalledWith(
      {
        hospital: null,
        position: "letters_only",
        reason: "Pilot only",
        version: 1,
        mfa_code: MOCK_CODE,
      },
      expect.anything(),
    );
    expect(
      within(global()).getByText(/^Letters only since/),
    ).toBeInTheDocument();
    expect(
      within(global()).getByText(/turned down by Ada Bakare: Pilot only$/),
    ).toBeInTheDocument();
    expect(fact(scope("Havana Hospital"), "In effect")).toBe("Letters only");
    expect(status()).toHaveTextContent(
      "Named access for every hospital is now Letters only",
    );
    expect(status()).toHaveFocus();
    expect(holding(MOCK_CODE)).toEqual([]);
  });

  it("a wrong code stays in the dialog", async () => {
    await show();
    await userEvent.click(
      within(scope("Havana Hospital")).getByRole("button", {
        name: "Turn down",
      }),
    );
    const form = screen.getByRole("dialog", { name: /^Turn down/ });
    await userEvent.click(within(form).getByRole("radio", { name: "Off" }));
    await userEvent.click(
      within(form).getByRole("button", { name: "Continue" }),
    );
    const d = await screen.findByRole("dialog", { name: /down to Off\?$/ });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "A complaint");
    await typeCode(d, "000000");
    await userEvent.click(within(d).getByRole("button", { name: "Turn down" }));
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(fact(scope("Havana Hospital"), "Own switch")).toBe("On");
    expect(holding("000000")).toEqual([]);
  });
});

describe("who sees what", () => {
  it("the auditor sees positions and history but no controls", async () => {
    await askRiverside();
    await show(AMARA);
    expect(within(global()).getByText(/^On since/)).toBeInTheDocument();
    expect(
      within(scope(RIVER)).getByText(
        /^Ada Bakare asked to turn it Letters only/,
      ),
    ).toBeInTheDocument();
    for (const name of ["Turn up", "Turn down", "Approve", "Cancel request"])
      expect(within(panel()).queryByRole("button", { name })).toBeNull();
    await userEvent.click(
      within(panel()).getByRole("button", { name: "History" }),
    );
    expect(
      within(panel()).getByRole("list", { name: "Switch history" }),
    ).toBeInTheDocument();
  });

  it("offline disables every control, with the reason", async () => {
    await askRiverside();
    env.online = false;
    await show(TUNDE);
    for (const name of ["Turn up", "Turn down", "Approve", "Cancel request"])
      for (const b of within(panel()).getAllByRole("button", { name }))
        expect(b).toBeDisabled();
    expect(
      within(panel()).getAllByText("You're offline. This needs a connection.")
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("history", () => {
  it("History lists the sign-off references", async () => {
    await show();
    const toggle = within(panel()).getByRole("button", { name: "History" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      within(panel()).queryByRole("list", { name: "Switch history" }),
    ).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = within(panel()).getByRole("list", { name: "Switch history" });
    const items = within(list).getAllByRole("listitem");
    // Newest first: Northgate turned Off, Northgate On, Havana On, global On.
    expect(items.map((li) => li.querySelector("p")?.textContent)).toEqual([
      expect.stringMatching(
        /^Northgate General Hospital turned down to Off · /,
      ),
      expect.stringMatching(/^Northgate General Hospital turned up to On · /),
      expect.stringMatching(/^Havana Hospital turned up to On · /),
      expect.stringMatching(/^Every hospital turned up to On · /),
    ]);
    expect(items[0]).toHaveTextContent(
      "by Tunde Okafor: Paused while Northgate checks who its letter covers",
    );
    const first = items[3]!;
    expect(first).toHaveTextContent(
      "requested by Ada Bakare, approved by Tunde Okafor",
    );
    expect(first).toHaveTextContent(
      /Clinical: Dr\. A\. Musa · \d+ Feb \d{4} · CS-014/,
    );
    expect(first).toHaveTextContent(
      /Privacy: Ngozi Eke · \d+ Feb \d{4} · PR-007/,
    );
    expect(first).toHaveTextContent(
      /Legal: Bayo Adeyemi · \d+ Feb \d{4} · LG-021/,
    );
    expect(items[2]).toHaveTextContent("CS-015");
  });
});
