import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { AddHospitalForm } from "./add-hospital-form";
import { HospitalPlaceholder } from "./hospital-placeholder";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

let api: ReturnType<typeof createMockPlatform>;
beforeEach(() => {
  push.mockClear();
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => __resetPlatformClientForTests());

async function fill(v: Partial<Record<string, string>> = {}) {
  const f = {
    Name: "Lakeside Hospital",
    "Short code": "lake1",
    "Allowed email domains": "",
    "First admin name": "Ngozi Eze",
    "First admin email": "ngozi@lakeside.example",
    ...v,
  };
  for (const [label, value] of Object.entries(f)) {
    const el = screen.getByLabelText(label);
    await userEvent.clear(el);
    if (value) await userEvent.type(el, value);
  }
}
const submit = () =>
  userEvent.click(screen.getByRole("button", { name: "Add hospital" }));

describe("the add hospital form", () => {
  it("add normalises pasted domains before sending", async () => {
    const spy = vi.spyOn(api, "addHospital");
    renderWithAuth(<AddHospitalForm />);
    await fill();
    const d = screen.getByLabelText("Allowed email domains");
    await userEvent.click(d);
    await userEvent.paste(" Lakeside.ORG, mail.lakeside.org\nlakeside.org\n");
    await submit();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const [body, opts] = spy.mock.calls[0]!;
    expect(body).toMatchObject({
      name: "Lakeside Hospital",
      short_code: "LAKE1",
      email_domains: ["lakeside.org", "mail.lakeside.org"],
      first_admin: { name: "Ngozi Eze", email: "ngozi@lakeside.example" },
    });
    expect(opts.idempotencyKey).toMatch(/\S+/);
  });

  it("a 121-character name is refused on the form", async () => {
    const spy = vi.spyOn(api, "addHospital");
    renderWithAuth(<AddHospitalForm />);
    await fill({ Name: "x".repeat(121) });
    await submit();
    expect(screen.getByLabelText("Name")).toBeInvalid();
    expect(screen.getByText("Use 1 to 120 characters.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("a used short code shows 'That short code is already used.'", async () => {
    const used = (await api.listHospitals({})).hospitals[0]!.short_code;
    renderWithAuth(<AddHospitalForm />);
    await fill({ "Short code": used });
    await submit();
    expect(
      await screen.findByText("That short code is already used."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Short code")).toBeInvalid();
    expect(push).not.toHaveBeenCalled();
  });

  it("success lands on the new hospital with Set-up incomplete", async () => {
    renderWithAuth(<AddHospitalForm />);
    await fill();
    await submit();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const path = push.mock.calls[0]![0] as string;
    expect(path).toMatch(/^\/hospitals\/h_lakeside_hospital$/);
    expect(
      (
        await screen.findAllByText(
          "Hospital added. Invite sent to ngozi@lakeside.example.",
        )
      ).length,
    ).toBeGreaterThan(0);
    // The page it lands on shows the new hospital's status.
    renderWithAuth(<HospitalPlaceholder id="h_lakeside_hospital" />);
    expect(await screen.findByText("Lakeside Hospital")).toBeInTheDocument();
    expect(screen.getByText("Set-up incomplete")).toBeInTheDocument();
  });

  it("an auditor sees the view-only message and no form", () => {
    renderWithAuth(<AddHospitalForm />, { user: AMARA });
    expect(
      screen.getByText("Your account can only view this."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("Add is disabled offline with the reason", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(<AddHospitalForm />);
    const b = screen.getByRole("button", { name: "Add hospital" });
    expect(b).toBeDisabled();
    expect(b).toHaveAccessibleDescription(
      "You're offline. Reconnect to add a hospital.",
    );
    vi.restoreAllMocks();
  });
});
