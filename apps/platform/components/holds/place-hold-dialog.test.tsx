import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@mhai/api-client/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { HOLD_HINT } from "@/lib/holds/labels";
import { REFERENCE_HINT } from "@/lib/holds/rules";
import { ADA, renderWithAuth } from "@/tests/render";
import { PlaceHoldDialog } from "./place-hold-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function install(
  over: Partial<PlatformClient> = {},
  opts: { removalStarted?: string[] } = {},
) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
    ...opts,
  });
  const c = { ...m, ...over } as PlatformClient;
  __setPlatformClientForTests(c);
  return { m, c };
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const HAVANA = { id: "h_havana", name: "Havana Hospital" };

function open(hospital = HAVANA, onPlaced = vi.fn(), onClose = vi.fn()) {
  renderWithAuth(
    <PlaceHoldDialog
      open
      hospital={hospital}
      onClose={onClose}
      onPlaced={onPlaced}
    />,
  );
  return { onPlaced, onClose };
}
const form = () => screen.getByRole("dialog", { name: "Place a legal hold" });

async function fill(d: HTMLElement) {
  await userEvent.click(within(d).getByLabelText("Complaint"));
  await userEvent.type(within(d).getByLabelText(/^Reference/), "CMP-2026-0009");
}
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

describe("Place a hold: the form", () => {
  it("a hold keeps all records and asks for no dates, note or name (core 1.26.0)", () => {
    open();
    const d = form();
    expect(within(d).getByText("All records")).toBeInTheDocument();
    expect(within(d).getByText(HOLD_HINT)).toBeInTheDocument();
    for (const gone of [/^From/, /^To/, /^Note/, /^Asked for by/])
      expect(within(d).queryByLabelText(gone)).toBeNull();
    expect(within(d).getByLabelText(/^Reference/)).toHaveAccessibleDescription(
      REFERENCE_HINT,
    );
  });

  it("Continue with empty fields shows each message and sends nothing", async () => {
    const { c } = install();
    const spy = vi.spyOn(c, "placeHold");
    renderWithAuth(
      <PlaceHoldDialog open onClose={vi.fn()} onPlaced={vi.fn()} />,
    );
    const d = form();
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    for (const m of [
      "Choose a hospital.",
      "Choose a reason.",
      "Enter the reference.",
    ])
      expect(within(d).getByText(m)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: /Place a legal hold on/ }),
    ).toBeNull();
  });

  it("a reference that isn't a document reference is refused before the code", async () => {
    open();
    const d = form();
    await userEvent.click(within(d).getByLabelText("Complaint"));
    await userEvent.type(within(d).getByLabelText(/^Reference/), "HC/2026/1");
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    expect(
      within(d).getByText("Use a document reference, like LH-2026-0042."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /Place a legal hold on/ }),
    ).toBeNull();
  });

  it("the picker leaves out Removed hospitals", async () => {
    const m = install().m;
    install({
      listHospitals: async (q) => {
        const r = await m.listHospitals(q);
        return {
          ...r,
          hospitals: [
            ...r.hospitals,
            {
              ...r.hospitals[0]!,
              id: "h_gone",
              name: "Gone Hospital",
              short_code: "GON",
              status: "removed",
            },
          ],
        };
      },
    });
    renderWithAuth(
      <PlaceHoldDialog open onClose={vi.fn()} onPlaced={vi.fn()} />,
    );
    const list = await screen.findByRole("list", { name: "Hospitals" });
    expect(within(list).getByText("Havana Hospital")).toBeInTheDocument();
    expect(within(list).queryByText("Gone Hospital")).toBeNull();
  });

  it("searches by name and chooses a hospital", async () => {
    renderWithAuth(
      <PlaceHoldDialog open onClose={vi.fn()} onPlaced={vi.fn()} />,
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search hospitals" }),
      "northgate",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Northgate General/ }),
    );
    expect(screen.getByText("Northgate General Hospital")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });
});

describe("Place a hold: confirming", () => {
  it("asks for the code and places the hold, then onPlaced", async () => {
    const { c } = install();
    const spy = vi.spyOn(c, "placeHold");
    const { onPlaced, onClose } = open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: "Place a legal hold on Havana Hospital?",
    });
    expect(
      within(s).getByText("All of the hospital's records."),
    ).toBeInTheDocument();
    expect(
      within(s).getByText(
        "They are kept until two platform admins lift the hold.",
      ),
    ).toBeInTheDocument();
    await typeCode(s);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    await waitFor(() => expect(onPlaced).toHaveBeenCalledTimes(1));
    expect(onPlaced.mock.calls[0]![0]).toMatchObject({
      hospital: HAVANA,
      reference: "CMP-2026-0009",
      reason: "complaint",
      status: "active",
      note: null,
      asked_by: null,
    });
    expect(onClose).toHaveBeenCalled();
    expect(spy.mock.calls[0]![0]).toEqual({
      hospital_id: "h_havana",
      reason: "complaint",
      reference: "CMP-2026-0009",
      review_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      mfa_code: MOCK_CODE,
    });
  });

  it("a wrong code shows That code didn't work", async () => {
    open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await typeCode(s, "000000");
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    expect(
      await within(s).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
  });

  it("after a wrong code, the mutation cache holds no code", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderWithAuth(
      <PlaceHoldDialog
        open
        hospital={HAVANA}
        onClose={vi.fn()}
        onPlaced={vi.fn()}
      />,
      { queryClient: qc },
    );
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await typeCode(s, "000000");
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    expect(
      await within(s).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    const kept = () =>
      JSON.stringify(
        qc
          .getMutationCache()
          .getAll()
          .map((m) => m.state.variables),
      );
    await waitFor(() => expect(kept()).not.toContain("000000"));
  });

  it("removal_started shows This hospital's removal has already started. Act outside the app now.", async () => {
    install({}, { removalStarted: ["h_havana"] });
    const { onPlaced } = open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await typeCode(s);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    expect(
      await screen.findByText(
        "This hospital's removal has already started. Act outside the app now.",
      ),
    ).toBeInTheDocument();
    // Back on the form; the code step is closed.
    expect(
      within(form()).getByRole("button", { name: "Continue" }),
    ).toBeVisible();
    expect(onPlaced).not.toHaveBeenCalled();
  });

  it("a reference an open hold already has is said on the form", async () => {
    install({
      placeHold: async () => {
        throw new ApiError(409, "conflict");
      },
    });
    open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await typeCode(s);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    expect(
      await screen.findByText(
        "An open legal hold already has this reference. Use another.",
      ),
    ).toBeInTheDocument();
  });

  it("hospital_removed shows its words on the form, closes the code step and refreshes hospitals", async () => {
    install({
      placeHold: async () => {
        throw new ApiError(409, "hospital_removed");
      },
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const refresh = vi.spyOn(qc, "invalidateQueries");
    const onPlaced = vi.fn();
    renderWithAuth(
      <PlaceHoldDialog
        open
        hospital={HAVANA}
        onClose={vi.fn()}
        onPlaced={onPlaced}
      />,
      { queryClient: qc },
    );
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await typeCode(s);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    expect(
      await screen.findByText(
        "This hospital has been removed. There is nothing left to hold.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /Place a legal hold on/ }),
    ).toBeNull();
    expect(
      within(form()).getByRole("button", { name: "Continue" }),
    ).toBeVisible();
    expect(onPlaced).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith({ queryKey: ["hospitals"] });
  });
});
