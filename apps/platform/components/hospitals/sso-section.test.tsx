import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@mhai/api-client/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { SsoSection } from "./sso-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: ReturnType<typeof createMockPlatform>;
beforeEach(() => {
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => __resetPlatformClientForTests());

const SECRET = "s3cr3t-value-9z8y";
const type = async (label: string, v: string) => {
  const el = screen.getByLabelText(label);
  await userEvent.clear(el);
  await userEvent.type(el, v);
};
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save" }));
const sw = () => screen.getByRole("switch", { name: "Single sign-on" });

async function fillRiverside() {
  await screen.findByLabelText("Sign-in address");
  await type("Sign-in address", "https://sso.riverside.example/start");
  await type("Client ID", "mh");
  await type("Issuer", "https://sso.riverside.example");
  await type("Allowed email domains", "riverside.example");
  await type("Client secret", SECRET);
}

describe("the single sign-on section", () => {
  it("a saved secret shows only its last four characters", async () => {
    renderWithAuth(
      <SsoSection hospitalId="h_northgate" hospitalName="Northgate" />,
    );
    expect(await screen.findByText("Saved · ends ··3f2a")).toBeInTheDocument();
    expect(screen.queryByLabelText("Client secret")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Replace secret" }),
    );
    const input = screen.getByLabelText("Client secret");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("the secret field is empty after saving and the value never appears in the DOM", async () => {
    const spy = vi.spyOn(api, "saveSso");
    renderWithAuth(<SsoSection hospitalId="h_riverside" />);
    await fillRiverside();
    await save();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1].client_secret).toBe(SECRET);
    expect(await screen.findByText("Saved · ends ··9z8y")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(SECRET);
    await userEvent.click(
      screen.getByRole("button", { name: "Replace secret" }),
    );
    expect(screen.getByLabelText("Client secret")).toHaveValue("");
  });

  it("the secret is cleared from state when the save fails", async () => {
    vi.spyOn(api, "saveSso").mockRejectedValueOnce(
      new ApiError(422, "invalid"),
    );
    renderWithAuth(<SsoSection hospitalId="h_riverside" />);
    await fillRiverside();
    await save();
    expect(
      await screen.findByText("Check the details and try again."),
    ).toBeVisible();
    expect(screen.getByLabelText("Client secret")).toHaveValue("");
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it("saving without typing a secret sends no client_secret", async () => {
    const spy = vi.spyOn(api, "saveSso");
    renderWithAuth(<SsoSection hospitalId="h_northgate" />);
    await screen.findByText("Saved · ends ··3f2a");
    await type("Client ID", "measured-health-2");
    await save();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect("client_secret" in spy.mock.calls[0]![1]).toBe(false);
    expect(spy.mock.calls[0]![1].version).toBe(1);
  });

  it("switching on needs a passing test", async () => {
    renderWithAuth(<SsoSection hospitalId="h_riverside" />);
    await fillRiverside();
    await save();
    await screen.findByText("Saved · ends ··9z8y");
    expect(sw()).toBeDisabled();
    expect(screen.getByText("Test sign-in first.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Test sign-in" }));
    expect(await screen.findByText(/^Worked · /)).toBeVisible();
    await waitFor(() => expect(sw()).toBeEnabled());
    await userEvent.click(sw());
    await save();
    await waitFor(async () =>
      expect((await api.getSso("h_riverside")).enabled).toBe(true),
    );
  });

  it("a change after a passing test needs a new test", async () => {
    renderWithAuth(<SsoSection hospitalId="h_northgate" />);
    await screen.findByText("Saved · ends ··3f2a");
    await userEvent.click(sw());
    await userEvent.click(screen.getByRole("button", { name: "Switch off" }));
    await type("Client ID", "other");
    await save();
    await waitFor(async () =>
      expect((await api.getSso("h_northgate")).client_id).toBe("other"),
    );
    await waitFor(() => expect(sw()).toBeDisabled());
    expect(screen.getByText("Test sign-in first.")).toBeVisible();
  });

  it("switching off asks first", async () => {
    const spy = vi.spyOn(api, "saveSso");
    renderWithAuth(
      <SsoSection hospitalId="h_northgate" hospitalName="Northgate General" />,
    );
    await screen.findByText("Saved · ends ··3f2a");
    await userEvent.click(sw());
    const d = screen.getByRole("dialog", { name: /switch off/i });
    expect(
      within(d).getByText(
        "Staff at Northgate General will sign in with email and password instead.",
      ),
    ).toBeVisible();
    expect(spy).not.toHaveBeenCalled();
    await userEvent.click(
      within(d).getByRole("button", { name: "Switch off" }),
    );
    await save();
    await waitFor(async () =>
      expect((await api.getSso("h_northgate")).enabled).toBe(false),
    );
  });

  it("cancelling the switch-off dialog leaves it on", async () => {
    renderWithAuth(<SsoSection hospitalId="h_northgate" />);
    await screen.findByText("Saved · ends ··3f2a");
    await userEvent.click(sw());
    expect(
      screen.getByText(
        "Staff at this hospital will sign in with email and password instead.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep it on" }));
    expect(sw()).toBeChecked();
  });

  it("a http:// sign-in address is refused", async () => {
    const spy = vi.spyOn(api, "saveSso");
    renderWithAuth(<SsoSection hospitalId="h_riverside" />);
    await fillRiverside();
    await type("Sign-in address", "http://sso.riverside.example/start");
    await save();
    const field = screen.getByLabelText("Sign-in address");
    expect(
      await screen.findByText("Use an address that starts with https://."),
    ).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(field).toHaveFocus());
    expect(spy).not.toHaveBeenCalled();
  });

  it("an auditor sees no inputs", async () => {
    renderWithAuth(<SsoSection hospitalId="h_northgate" />, { user: AMARA });
    expect(await screen.findByText("Saved · ends ··3f2a")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace secret" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByText("https://sso.northgate.example/start"),
    ).toBeVisible();
  });

  it("a conflict offers Reload, which discards local edits", async () => {
    renderWithAuth(<SsoSection hospitalId="h_northgate" />);
    await screen.findByText("Saved · ends ··3f2a");
    await type("Client ID", "mine");
    vi.spyOn(api, "saveSso").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    await save();
    expect(await screen.findByText("Changed by someone else")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Client ID")).toHaveValue("measured-health"),
    );
    expect(screen.queryByText("Changed by someone else")).toBeNull();
  });

  it("shows the last test result, and a failed one with its message", async () => {
    renderWithAuth(<SsoSection hospitalId="h_northgate" />);
    expect(
      await screen.findByText(/^Worked · \d+ \w+ \d{4}, \d\d:\d\d$/),
    ).toBeVisible();
    vi.spyOn(api, "testSso").mockResolvedValueOnce({
      ...(await api.getSso("h_northgate")),
      last_test: {
        at: new Date().toISOString(),
        ok: false,
        message: "Bad issuer.",
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Test sign-in" }));
    expect(await screen.findByText("Didn't work: Bad issuer.")).toBeVisible();
  });
});
