import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, renderWithAuth } from "@/tests/render";
import { ConnectionView } from "./connection-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/connections/emr_hv1",
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
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const SECRET = "SECRET-replacement-key-7q7q";
const region = (name: string) => screen.getByRole("region", { name });
async function edit(id = "emr_hv1", queryClient?: QueryClient) {
  renderWithAuth(<ConnectionView id={id} />, { queryClient });
  await screen.findByRole("region", { name: "Settings" });
  await userEvent.click(
    within(region("Settings")).getByRole("button", { name: "Edit" }),
  );
}
const type = async (label: string, v: string) => {
  const el = screen.getByLabelText(label);
  await userEvent.clear(el);
  await userEvent.type(el, v);
};
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save changes" }));
async function confirmWithCode() {
  const d = screen.getByRole("dialog", {
    name: "Save changes to Main record?",
  });
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(MOCK_CODE);
  await userEvent.click(
    within(d).getByRole("button", { name: "Save changes" }),
  );
}

describe("editing a connection", () => {
  it("renders the type's fields from the API", async () => {
    await edit();
    expect(screen.getByLabelText("Name the hospital sees")).toHaveValue(
      "Main record",
    );
    expect(screen.getByLabelText("Base address")).toHaveValue(
      "https://records.havana.example/fhir",
    );
    expect(screen.getByLabelText("Client ID")).toHaveValue("mhai-havana");
    // The saved secret is a row, not an input.
    expect(screen.queryByLabelText("Private key")).toBeNull();
    expect(screen.getByText(/^Set · /)).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("an http address is refused with Use an address that starts with https://.", async () => {
    const spy = vi.spyOn(api, "updateConnection");
    await edit();
    await type("Base address", "http://records.havana.example/fhir");
    await save();
    expect(
      screen.getByText("Use an address that starts with https://."),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Base address")).toHaveFocus();
  });

  it("Replace reveals an empty secret input; leaving it empty sends no credentials", async () => {
    const spy = vi.spyOn(api, "updateConnection");
    await edit();
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    const input = screen.getByLabelText("Private key");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
    await type("Client ID", "mhai-havana-2");
    await save();
    expect(
      screen.getByText(
        "You'll need to test the connection again before it can be switched on.",
      ),
    ).toBeVisible();
    await confirmWithCode();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const body = spy.mock.calls[0]![1];
    expect("credentials" in body).toBe(false);
    expect(body.settings).toEqual({ client_id: "mhai-havana-2" });
    expect(body.version).toBe(3);
  });

  it("changing only the name does not warn about testing again", async () => {
    const spy = vi.spyOn(api, "updateConnection");
    await edit();
    await type("Name the hospital sees", "Main chart");
    await save();
    expect(screen.queryByText(/test the connection again/)).toBeNull();
    const d = screen.getByRole("dialog", {
      name: "Save changes to Main record?",
    });
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1]).toMatchObject({ source_label: "Main chart" });
    expect("settings" in spy.mock.calls[0]![1]).toBe(false);
    expect(
      await screen.findByRole("heading", { name: "Main chart" }),
    ).toBeVisible();
  });

  it("Cancel returns to the read view without sending", async () => {
    const spy = vi.spyOn(api, "updateConnection");
    await edit();
    await type("Client ID", "other");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Client ID")).toBeNull();
    expect(screen.getByText("mhai-havana")).toBeVisible();
    expect(spy).not.toHaveBeenCalled();
  });

  it("after saving, no secret remains in the form or the query cache", async () => {
    const spy = vi.spyOn(api, "updateConnection");
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await edit("emr_hv1", qc);
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    await userEvent.type(screen.getByLabelText("Private key"), SECRET);
    await save();
    await confirmWithCode();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1].credentials).toEqual({ private_key: SECRET });
    // Back on the read view, with the new date and no value anywhere.
    expect(
      await within(region("Settings")).findByRole("button", { name: "Edit" }),
    ).toBeVisible();
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(document.querySelector("input[type=password]")).toBeNull();
    const cache = JSON.stringify(
      qc
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cache).not.toContain(SECRET);
    await waitFor(() =>
      expect(
        JSON.stringify(
          qc
            .getMutationCache()
            .getAll()
            .map((m) => m.state.variables),
        ),
      ).not.toContain(SECRET),
    );
    expect(JSON.stringify(await api.getConnection("emr_hv1"))).not.toContain(
      SECRET,
    );
    // Editing again starts empty.
    await userEvent.click(
      within(region("Settings")).getByRole("button", { name: "Edit" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(screen.getByLabelText("Private key")).toHaveValue("");
  });
});
