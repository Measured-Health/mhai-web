import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { NamedPosition } from "@/lib/api/clearances-contract";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { FILL_IN } from "@/lib/clearances/switch";
import { ADA, renderWithAuth } from "@/tests/render";
import {
  SwitchLowerDialog,
  SwitchRequestDialog,
} from "./switch-request-dialog";

const env = vi.hoisted(() => ({ online: true }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clearances",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => env.online }));
vi.mock("@mhai/ui/hooks/use-media", () => ({ useIsDesktop: () => true }));

const RIVER = { id: "h_riverside", name: "Riverside Children's Hospital" };
const TODAY = "2026-10-23";

let api: PlatformClient;
beforeEach(() => {
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => {
  env.online = true;
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

function raise(
  over: {
    current?: NamedPosition;
    ceiling?: NamedPosition;
    onDone?: () => void;
    onClose?: () => void;
  } = {},
) {
  const props = {
    onDone: vi.fn(),
    onClose: vi.fn(),
    onRefused: vi.fn(),
    ...over,
  };
  renderWithAuth(
    <SwitchRequestDialog
      open
      scope={{ hospital: RIVER }}
      current={over.current ?? "off"}
      ceiling={over.ceiling ?? "on"}
      today={TODAY}
      version={1}
      {...props}
    />,
    {
      user: ADA,
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    },
  );
  return {
    ...props,
    form: screen.getByRole("dialog", { name: /^Turn up named access/ }),
  };
}

async function sign(
  form: HTMLElement,
  label: "Clinical" | "Privacy" | "Legal",
  by: string,
  at: string,
  ref: string,
) {
  const g = within(form).getByRole("group", { name: label });
  if (by)
    await userEvent.type(
      within(g).getByLabelText("Signed by (name and role)"),
      by,
    );
  if (at)
    fireEvent.change(within(g).getByLabelText("Date"), {
      target: { value: at },
    });
  if (ref)
    await userEvent.type(within(g).getByLabelText("Document reference"), ref);
}
async function signAll(form: HTMLElement, legalAt = "2026-10-21") {
  await sign(
    form,
    "Clinical",
    "Dr. A. Musa, Clinical lead",
    "2026-10-20",
    "CS-1",
  );
  await sign(form, "Privacy", "N. Eke, Data protection", "2026-10-20", "PR-1");
  await sign(form, "Legal", "B. Adeyemi, Legal counsel", legalAt, "LG-1");
}
const cont = (form: HTMLElement) =>
  userEvent.click(within(form).getByRole("button", { name: "Continue" }));

describe("SwitchRequestDialog", () => {
  it("offers only the positions above where it is, up to the ceiling", async () => {
    const { form } = raise({ current: "off", ceiling: "on" });
    expect(
      within(form)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(["letters_only", "on"]);
    // Nothing is chosen for the person when there is a choice.
    for (const r of within(form).getAllByRole("radio"))
      expect(r).not.toBeChecked();
    await signAll(form);
    await cont(form);
    expect(within(form).getByText("Choose a position.")).toBeInTheDocument();
  });

  it("a hospital can't be offered a position above global", () => {
    const { form } = raise({ current: "off", ceiling: "letters_only" });
    const radios = within(form).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("value"))).toEqual([
      "letters_only",
    ]);
    expect(radios[0]).toBeChecked();
  });

  it("has a Clinical, Privacy and Legal group, each with who signed, the date and the document", () => {
    const { form } = raise();
    for (const label of ["Clinical", "Privacy", "Legal"]) {
      const g = within(form).getByRole("group", { name: label });
      expect(
        within(g).getByLabelText("Signed by (name and role)"),
      ).toBeRequired();
      const date = within(g).getByLabelText("Date");
      expect(date).toHaveAttribute("type", "date");
      expect(date).toHaveAttribute("max", TODAY);
      expect(within(g).getByLabelText("Document reference")).toBeRequired();
    }
    expect(
      within(form).getByText(
        "A different platform admin must approve before this takes effect.",
      ),
    ).toBeInTheDocument();
  });

  it("a missing legal reference blocks the request", async () => {
    const ask = vi.spyOn(api, "requestNamedAccess");
    const { form } = raise({ ceiling: "letters_only" });
    await sign(form, "Clinical", "Dr. A. Musa", "2026-10-20", "CS-1");
    await sign(form, "Privacy", "N. Eke", "2026-10-20", "PR-1");
    await sign(form, "Legal", "B. Adeyemi", "2026-10-21", "");
    await cont(form);
    expect(within(form).getByText(FILL_IN)).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it("a sign-off dated after the server's day is refused", async () => {
    const { form } = raise({ ceiling: "letters_only" });
    await signAll(form, "2026-10-24");
    await cont(form);
    expect(
      within(form).getByText("A sign-off date can't be in the future"),
    ).toBeInTheDocument();
  });

  it("Back from the code keeps what was entered", async () => {
    const { form } = raise({ ceiling: "letters_only" });
    await signAll(form);
    await cont(form);
    const d = await screen.findByRole("dialog", { name: /^Ask to turn/ });
    await userEvent.click(within(d).getByRole("button", { name: "Back" }));
    const again = await screen.findByRole("dialog", { name: /^Turn up/ });
    const legal = within(again).getByRole("group", { name: "Legal" });
    expect(within(legal).getByLabelText("Document reference")).toHaveValue(
      "LG-1",
    );
  });

  it("sends the sign-offs trimmed, with the version and the code", async () => {
    const ask = vi.spyOn(api, "requestNamedAccess");
    const { form, onDone } = raise({ ceiling: "letters_only" });
    await sign(form, "Clinical", "  Dr. A. Musa  ", "2026-10-20", " CS-1 ");
    await sign(form, "Privacy", "N. Eke", "2026-10-20", "PR-1");
    await sign(form, "Legal", "B. Adeyemi", "2026-10-21", "LG-1");
    await cont(form);
    const d = await screen.findByRole("dialog", { name: /^Ask to turn/ });
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Ask for approval" }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(ask.mock.calls[0]![0]).toEqual({
      hospital: "h_riverside",
      position: "letters_only",
      signoffs: {
        clinical: { by: "Dr. A. Musa", at: "2026-10-20", ref: "CS-1" },
        privacy: { by: "N. Eke", at: "2026-10-20", ref: "PR-1" },
        legal: { by: "B. Adeyemi", at: "2026-10-21", ref: "LG-1" },
      },
      version: 1,
      mfa_code: MOCK_CODE,
    });
  });
});

describe("SwitchLowerDialog", () => {
  it("offers the positions below, then asks for a reason and a code", async () => {
    renderWithAuth(
      <SwitchLowerDialog
        open
        scope={{ hospital: null }}
        current="on"
        version={1}
        onClose={vi.fn()}
        onDone={vi.fn()}
        onRefused={vi.fn()}
      />,
      { user: ADA, queryClient: new QueryClient() },
    );
    const form = screen.getByRole("dialog", {
      name: "Turn down named access for every hospital",
    });
    expect(
      within(form)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(["off", "letters_only"]);
    await cont(form);
    expect(within(form).getByText("Choose a position.")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("radio", { name: "Off" }));
    await cont(form);
    const d = await screen.findByRole("dialog", {
      name: "Turn named access for every hospital down to Off?",
    });
    expect(
      within(d).getByText(
        "This takes effect at once and ends every named view on screen.",
      ),
    ).toBeInTheDocument();
    expect(within(d).getByLabelText(/^Reason/)).toBeInTheDocument();
  });
});
