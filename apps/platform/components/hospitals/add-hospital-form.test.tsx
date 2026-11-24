import { screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@mhai/api-client/errors";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { MOCK_CODE, createStepUp } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { ADD_WORDS, AddHospitalForm } from "./add-hospital-form";
import { HospitalView } from "./hospital-view";

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
afterEach(() => {
  vi.restoreAllMocks();
  __resetPlatformClientForTests();
});

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
const dialog = () =>
  screen.findByRole("dialog", { name: "Add this hospital?" });
/** Types the code into the open dialog and confirms. */
async function confirm(code = MOCK_CODE) {
  const d = await dialog();
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
  await userEvent.click(within(d).getByRole("button", { name: "Add" }));
  return d;
}
/** Fills, submits and confirms with the right code. */
async function addWith(v: Partial<Record<string, string>> = {}) {
  await fill(v);
  await submit();
  return confirm();
}
const closed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

describe("the add hospital form", () => {
  it("add normalises pasted domains and sends them with the two-step code", async () => {
    const spy = vi.spyOn(api, "addHospital");
    renderWithAuth(<AddHospitalForm />);
    await fill();
    const d = screen.getByLabelText("Allowed email domains");
    await userEvent.click(d);
    await userEvent.paste(" Lakeside.ORG, mail.lakeside.org\nlakeside.org\n");
    await submit();
    // Nothing is sent until the code is given.
    expect(await dialog()).toHaveTextContent(
      "Lakeside Hospital will be added, and ngozi@lakeside.example will get an email invitation to set it up.",
    );
    expect(spy).not.toHaveBeenCalled();
    await confirm();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const [body, opts] = spy.mock.calls[0]!;
    expect(body).toEqual({
      name: "Lakeside Hospital",
      short_code: "LAKE1",
      country: "NG",
      time_zone: "Africa/Lagos",
      email_domains: ["lakeside.org", "mail.lakeside.org"],
      first_admin: { name: "Ngozi Eze", email: "ngozi@lakeside.example" },
      mfa_code: MOCK_CODE,
    });
    expect(opts.idempotencyKey).toMatch(/\S+/);
  });

  it("the country is searched by name and sent as its 2-letter code", async () => {
    const spy = vi.spyOn(api, "addHospital");
    renderWithAuth(<AddHospitalForm />);
    const country = screen.getByRole("combobox", { name: "Country" });
    // Nigeria is chosen to start with.
    expect(country).toHaveValue("Nigeria");
    await userEvent.clear(country);
    await userEvent.type(country, "gha");
    const list = screen.getByRole("listbox", { name: "Countries" });
    await userEvent.click(within(list).getByRole("option", { name: "Ghana" }));
    expect(country).toHaveValue("Ghana");
    await addWith();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![0].country).toBe("GH");
  });

  it("the keyboard picks a country too", async () => {
    const spy = vi.spyOn(api, "addHospital");
    renderWithAuth(<AddHospitalForm />);
    const country = screen.getByRole("combobox", { name: "Country" });
    await userEvent.clear(country);
    await userEvent.type(country, "kenya");
    await userEvent.keyboard("{Enter}");
    expect(country).toHaveValue("Kenya");
    await addWith();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![0].country).toBe("KE");
  });

  it("a country typed but not picked is refused on the form", async () => {
    const spy = vi.spyOn(api, "addHospital");
    renderWithAuth(<AddHospitalForm />);
    const country = screen.getByRole("combobox", { name: "Country" });
    await userEvent.clear(country);
    await userEvent.type(country, "Nigeri");
    await fill();
    await submit();
    expect(country).toBeInvalid();
    expect(country).toHaveFocus();
    expect(country).toHaveAccessibleDescription(
      "Choose a country from the list.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
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

  it("focus moves to the first field with an error", async () => {
    renderWithAuth(<AddHospitalForm />);
    await fill({ "Short code": "x", "First admin email": "nope" });
    await submit();
    expect(screen.getByLabelText("Short code")).toHaveFocus();
    await fill({
      Name: "Ok",
      "Short code": "OK1",
      "First admin email": "nope",
    });
    await submit();
    expect(screen.getByLabelText("First admin email")).toHaveFocus();
  });

  it("409 duplicate marks the short code", async () => {
    const used = (await api.listHospitals({})).hospitals[0]!.short_code;
    renderWithAuth(<AddHospitalForm />);
    await addWith({ "Short code": used });
    await closed();
    expect(
      await screen.findByText("That short code is already used."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Short code")).toBeInvalid();
    expect(screen.getByLabelText("Short code")).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("409 email_in_use marks the first admin's email", async () => {
    renderWithAuth(<AddHospitalForm />);
    await addWith({ "First admin email": TEAM_EMAILS.tunde });
    await closed();
    const email = screen.getByLabelText("First admin email");
    expect(await screen.findByText(ADD_WORDS.emailInUse)).toBeInTheDocument();
    expect(ADD_WORDS.emailInUse).toBe(
      "Someone already has an account with this email.",
    );
    expect(email).toBeInvalid();
    expect(email).toHaveFocus();
    expect(email).toHaveAccessibleDescription(ADD_WORDS.emailInUse);
    expect(push).not.toHaveBeenCalled();
    expect((await api.listHospitals({})).hospitals).toHaveLength(12);
  });

  it("503 no_delivery says email isn't set up and nothing was added", async () => {
    api = createMockPlatform({
      delayMs: 0,
      me: () => ADA.email,
      stepUp: createStepUp(),
      delivery: "none",
    });
    __setPlatformClientForTests(api);
    renderWithAuth(<AddHospitalForm />);
    await addWith();
    await closed();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Email isn't set up, so the invitation couldn't be sent.",
    );
    expect(alert).toHaveTextContent("Nothing was added.");
    expect(push).not.toHaveBeenCalled();
    expect((await api.listHospitals({})).hospitals).toHaveLength(12);
  });

  it.each([
    [422, "validation_failed", ADD_WORDS.invalid],
    [422, "invalid", ADD_WORDS.invalid],
    // Not "This was removed or no longer exists.": nothing was being read.
    [404, "not_found", ADD_WORDS.notAdded],
  ])(
    "%i %s closes the dialog and is announced on the form, in plain words",
    async (status, code, words) => {
      vi.spyOn(api, "addHospital").mockRejectedValue(
        new ApiError(status, code),
      );
      renderWithAuth(<AddHospitalForm />);
      await addWith();
      await closed();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(words);
      expect(alert).toHaveTextContent("Nothing was added.");
      expect(alert).not.toHaveTextContent("no longer exists");
    },
  );

  it.each([
    [403, "mfa_invalid", "That code didn't work. Try again."],
    [429, "mfa_locked", "Too many wrong codes. Try again in 15 minutes."],
    [403, "mfa_required", "Turn on two-step in Account first."],
  ])(
    "%i %s stays in the dialog, as the other step-up actions",
    async (status, code, words) => {
      vi.spyOn(api, "addHospital").mockRejectedValue(
        new ApiError(status, code),
      );
      renderWithAuth(<AddHospitalForm />);
      const d = await addWith();
      expect(await within(d).findByText(words)).toBeVisible();
      expect(screen.getByRole("dialog")).toBe(d);
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("a wrong code from the demo is cleared for another try, then the right one adds it", async () => {
    renderWithAuth(<AddHospitalForm />);
    await fill();
    await submit();
    const d = await confirm("000000");
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeVisible();
    expect(within(d).getByLabelText("Digit 1 of 6")).toHaveValue("");
    await confirm();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it("Cancel in the dialog sends nothing and keeps the form", async () => {
    const spy = vi.spyOn(api, "addHospital");
    renderWithAuth(<AddHospitalForm />);
    await fill();
    await submit();
    const d = await dialog();
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await closed();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Lakeside Hospital");
  });

  it("success lands on the new hospital with Set-up incomplete and its country's name", async () => {
    renderWithAuth(<AddHospitalForm />);
    await addWith();
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
    // The page it lands on shows the new hospital's status and country.
    renderWithAuth(<HospitalView id="h_lakeside_hospital" />);
    expect(
      await screen.findByRole("heading", { name: "Lakeside Hospital" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Set-up incomplete")).toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Details" });
    expect(within(details).getByText("Nigeria")).toBeInTheDocument();
    expect(within(details).queryByText("NG")).toBeNull();
  });

  it("the button says Adding… while in flight", async () => {
    let release!: () => void;
    const real = api.addHospital.bind(api);
    vi.spyOn(api, "addHospital").mockImplementation(
      (b, o) => new Promise((r) => (release = () => r(real(b, o)))),
    );
    renderWithAuth(<AddHospitalForm />);
    await addWith();
    expect(
      await screen.findByRole("button", { name: "Adding…" }),
    ).toBeDisabled();
    release();
    await waitFor(() => expect(push).toHaveBeenCalled());
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
  });
});
