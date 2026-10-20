import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { useAlertList } from "@/lib/notification-queries";
import { readPrefill } from "@/lib/notifications/ask";
import { ALERT_NOW, makeAlert, mockAlerts } from "@/tests/alerts";
import { renderWithAuth } from "@/tests/auth-wrapper";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
import { AlertCard } from "./alert-card";

/** The card as the page shows it: read from the cached list, so updates land. */
function Listed({ id }: { id: string }) {
  const q = useAlertList({ status: "new" });
  const a = q.data?.pages.flatMap((p) => p.alerts).find((x) => x.id === id);
  return a ? <AlertCard alert={a} now={ALERT_NOW} showSource /> : null;
}
const card = () => screen.findByRole("article");
const offline = () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => void window.dispatchEvent(new Event("offline")));
};
/** Notes if "someone else handled" ever shows, even for a moment. */
function watchForGone() {
  let seen = false;
  const look = (n: Node) => {
    if (n.textContent?.includes("Someone else handled")) seen = true;
  };
  const watch = new MutationObserver((records) =>
    records.forEach((r) => r.addedNodes.forEach(look)),
  );
  watch.observe(document.body, { childList: true, subtree: true });
  return () => {
    look(document.body);
    watch.disconnect();
    return seen;
  };
}
const phone = () =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );

beforeEach(() => {
  holder.client = mockAlerts();
  push.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // TanStack's onlineManager heard any "offline": tell it we're back.
  act(() => void window.dispatchEvent(new Event("online")));
});

describe("AlertCard", () => {
  it("shows the alert in the spec's order, in words and icons", () => {
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource />,
    );
    const c = screen.getByRole("article", {
      name: "Potassium 2.9 mmol/L (low; normal 3.5–5.1) · 08:42 Maryam Abdullahi",
    });
    const text = c.textContent!;
    const order = [
      "Critical",
      "Potassium 2.9 mmol/L (low; normal 3.5–5.1)",
      "Likely causes · Suggested by MHAI",
      "Maryam Abdullahi",
      "204817",
      "Ward 3 · Bed 12",
      "Acknowledge",
      "Ask MHAI about it",
      "Open patient record",
      "Dismiss",
    ];
    const at = order.map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(within(c).getByText("Diuretic treatment")).toBeVisible();
    expect(within(c).getByText("High confidence")).toBeVisible();
    expect(within(c).getByText("Use with caution")).toBeVisible();
    expect(within(c).getByText("Needs review")).toBeVisible();
    expect(
      within(c).getByText("Suggestions to check, not a diagnosis."),
    ).toBeVisible();
    expect(within(c).getByText("New")).toBeVisible();
    expect(within(c).getByText("Main record")).toBeVisible();
    expect(within(c).getByText("Critical").querySelector("svg")).toBeTruthy();
    const record = within(c).getByRole("link", { name: /Open patient record/ });
    expect(record).toHaveAttribute(
      "href",
      "https://record.example/open/al-test",
    );
    expect(record).toHaveAttribute("target", "_blank");
    expect(record).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("leaves the source out when the hospital has one system (R10)", () => {
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource={false} />,
    );
    expect(screen.queryByText("Main record")).toBeNull();
  });

  it("shows a sparse, unstandardised alert without guessing (Review Focus 4)", () => {
    renderWithAuth(
      <AlertCard
        alert={makeAlert({
          severity: "catastrophic" as never,
          finding: {
            name: "HS-TROP (local code)",
            value: "52",
            unit: "ng/L",
            flag: null,
            reference_range: null,
            recorded_at: null,
            code_system: null,
            standardised: false,
          },
          likely_causes: [],
          patient: {
            full_name: "Blessing Uche",
            mrn: "702366",
            location: null,
          },
          emr_link: "http://record.example/open/x",
        })}
        now={ALERT_NOW}
        showSource={false}
      />,
    );
    const c = screen.getByRole("article");
    expect(within(c).getByText("Urgent")).toBeVisible();
    expect(within(c).getByRole("heading", { level: 3 })).toHaveTextContent(
      /^HS-TROP \(local code\) 52 ng\/L$/,
    );
    expect(within(c).getByText("Not standardised")).toBeVisible();
    expect(within(c).getByText("Location not recorded")).toBeVisible();
    expect(within(c).queryByText(/Suggested by MHAI/)).toBeNull();
    expect(
      within(c).queryByRole("link", { name: /Open patient record/ }),
    ).toBeNull();
  });

  it("acknowledges with one key, then says who and moves the focus there (R6)", async () => {
    const user = userEvent.setup();
    const ack = vi.spyOn(holder.client, "acknowledgeAlert");
    renderWithAuth(<Listed id="al-101" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Acknowledge" }));
    const line = await within(c).findByText(
      "Acknowledged by Dr. Reyes · 09:00",
    );
    await waitFor(() => expect(line).toHaveFocus());
    expect(within(c).getByText("Handled")).toBeVisible();
    expect(
      within(c).getByRole("button", { name: "Acknowledge" }),
    ).toBeDisabled();
    expect(within(c).getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(
      within(c).getByRole("button", { name: "Ask MHAI about it" }),
    ).toBeEnabled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack.mock.calls[0]![1]?.idempotencyKey).toBeTruthy();
  });

  it("shows who handled it first and disables the actions with that reason (Review Focus 1)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-101" />);
    const c = await card();
    holder.client.handleElsewhere("al-101", "Dr. Okafor");
    await user.click(within(c).getByRole("button", { name: "Acknowledge" }));
    expect(
      await within(c).findByText("Someone else handled this alert"),
    ).toBeVisible();
    const line = within(c).getByText("Acknowledged by Dr. Okafor · 09:00");
    await waitFor(() => expect(line).toHaveFocus());
    for (const name of ["Acknowledge", "Dismiss"]) {
      const b = within(c).getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(
        "Acknowledged by Dr. Okafor · 09:00",
      );
    }
  });

  it("needs a reason to dismiss, then records it with the note", async () => {
    const user = userEvent.setup();
    const dismiss = vi.spyOn(holder.client, "dismissAlert");
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    expect(
      within(dialog).getByText(
        /The alert for Samuel Bassey moves to Dismissed/,
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(within(dialog).getByText("✕ Choose a reason.")).toBeVisible();
    expect(
      within(dialog).getByRole("radio", { name: "Not clinically relevant" }),
    ).toHaveFocus();
    expect(dismiss).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("radio", { name: "Already known" }),
    );
    await user.type(
      within(dialog).getByLabelText("Note (optional)"),
      "Known kidney disease.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(
      await within(c).findByText(
        "Dismissed by Dr. Reyes · 09:00 · Already known",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Dismiss alert" })).toBeNull();
    // The dialog has closed; the focus is on the handled line, not lost (R6).
    await waitFor(() =>
      expect(
        within(c).getByText("Dismissed by Dr. Reyes · 09:00 · Already known"),
      ).toHaveFocus(),
    );
    expect(dismiss).toHaveBeenCalledWith(
      "al-105",
      { reason: "already_known", note: "Known kidney disease." },
      { idempotencyKey: expect.any(String) },
    );
  });

  it("says in the dialog when someone else handled it meanwhile (Review Focus 1)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    holder.client.handleElsewhere("al-105", "Nurse Bello", "dismissed");
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    await user.click(
      within(dialog).getByRole("radio", { name: "Wrong patient" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(
      await within(dialog).findByText("Someone else handled this alert"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Nothing you choose here will be sent/),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    ).toBeDisabled();
    expect(
      within(c).getByText(/^Dismissed by Nurse Bello · 09:00/),
    ).toBeVisible();
  });

  it("never says someone else handled it when your own dismiss lands (F15)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    await user.click(
      within(dialog).getByRole("radio", { name: "Already known" }),
    );
    const seenGone = watchForGone();
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(
      await within(c).findByText(
        "Dismissed by Dr. Reyes · 09:00 · Already known",
      ),
    ).toBeVisible();
    expect(seenGone()).toBe(false);
  });

  it("closing the dialog after someone else handled it focuses who did (F15)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    holder.client.handleElsewhere("al-105", "Nurse Bello", "dismissed");
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    await user.click(
      within(dialog).getByRole("radio", { name: "Wrong patient" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    await within(dialog).findByText("Someone else handled this alert");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(within(c).getByText(/^Dismissed by Nurse Bello/)).toHaveFocus(),
    );
  });

  it("can't send a dismiss offline, and the dialog says why (F15)", async () => {
    const user = userEvent.setup();
    const dismiss = vi.spyOn(holder.client, "dismissAlert");
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    await user.click(
      within(dialog).getByRole("radio", { name: "Already known" }),
    );
    offline();
    const send = within(dialog).getByRole("button", { name: "Dismiss alert" });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription(
      "You're offline. Dismiss needs a connection.",
    );
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("dismisses from a bottom sheet on a phone (F15)", async () => {
    phone();
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    const sheet = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    expect(
      within(sheet).getByRole("heading", { name: "Dismiss this alert?" }),
    ).toBeVisible();
    await user.click(within(sheet).getByRole("radio", { name: "Other" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(
      await within(c).findByText("Dismissed by Dr. Reyes · 09:00 · Other"),
    ).toBeVisible();
  });

  it("caps the note at 500 characters and counts them (F15)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    const note = within(dialog).getByLabelText("Note (optional)");
    await user.click(note);
    await user.paste("x".repeat(600));
    expect(note).toHaveValue("x".repeat(500));
    expect(within(dialog).getByText("500 / 500")).toBeVisible();
  });

  it("asks MHAI with a prefill that carries no name or MRN (R11)", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource />,
    );
    await user.click(screen.getByRole("button", { name: "Ask MHAI about it" }));
    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0]![0] as string;
    expect(href).toMatch(/^\/\?prefill=[a-z0-9]{12}$/);
    const values = readPrefill(
      new URL(href, "http://x.test").searchParams.get("prefill"),
    );
    expect(values?.age).toBe("67");
    expect(JSON.stringify(values)).not.toMatch(
      /Maryam|Abdullahi|204817|Ward 3/,
    );
  });

  it("disables Acknowledge and Dismiss offline, and says why", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource />,
    );
    for (const name of ["Acknowledge", "Dismiss"]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(
        "You're offline. Acknowledge and Dismiss need a connection.",
      );
    }
    expect(
      screen.getByRole("button", { name: "Ask MHAI about it" }),
    ).toBeEnabled();
  });

  it("says why a save failed, and keeps the alert as it was", async () => {
    const user = userEvent.setup();
    vi.spyOn(holder.client, "acknowledgeAlert").mockRejectedValue(
      new ApiError(400, "error"),
    );
    renderWithAuth(<Listed id="al-101" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Acknowledge" }));
    expect(await within(c).findByText("Couldn't save that")).toBeVisible();
    expect(
      within(c).getByRole("button", { name: "Acknowledge" }),
    ).toBeEnabled();
  });

  it("wraps a long name instead of cutting it off", () => {
    const long = "Oluwafunmilayo Adebayo-Ogunleye-Fashola";
    renderWithAuth(
      <AlertCard
        alert={makeAlert({
          patient: { ...makeAlert().patient, full_name: long },
        })}
        now={ALERT_NOW}
        showSource
      />,
    );
    const name = screen.getByText(long);
    expect(name).not.toHaveClass("truncate");
    expect(name.className).toContain("[overflow-wrap:anywhere]");
  });
});
