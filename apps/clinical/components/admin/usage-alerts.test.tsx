import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UsageAlertsOut, UsageOut } from "@/lib/api/admin-contract";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { mockAdminAs, mockAdminWith } from "@/tests/admin";
import { UsageAlerts } from "./usage-alerts";

const usage = (p: UsageOut["period"] = "this_month") =>
  mockAdminAs(null).getUsage(p);
const withAlerts = async (
  over: (a: UsageAlertsOut) => Partial<UsageAlertsOut>,
): Promise<UsageOut> => {
  const u = await usage();
  const a = u.alerts as UsageAlertsOut;
  return { ...u, alerts: { ...a, ...over(a) } };
};
const hidden = { value: null, suppressed: true };
const label = (text: string) => screen.getByText(text, { selector: "span" });
const tile = (text: string) => label(text).closest("div")!;
const group = () => screen.getByRole("region", { name: "Patient alerts" });
const items = (name: string) =>
  within(screen.getByRole("region", { name })).getAllByRole("listitem");
const SEVERITIES = ["Critical", "Urgent", "Info"] as const;

function expectCouldntLoad(container: HTMLElement) {
  expect(
    within(group()).getByText("Couldn't load patient alerts"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Fewer than 5")).toBeNull();
  // The intro's "fewer than 5" is the only number.
  expect(container.textContent?.replace("fewer than 5", "")).not.toMatch(/\d/);
}

describe("UsageAlerts (core's block)", () => {
  it("shows the period's alerts by severity, handling, route and kind of result", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    expect(
      within(group()).getByText(
        "Counts for your hospital only. Groups of fewer than 5 are hidden.",
      ),
    ).toBeInTheDocument();
    expect(tile("Alerts")).toHaveTextContent("128");
    expect(tile("Critical")).toHaveTextContent("17");
    expect(items("What happened to them").map((li) => li.textContent)).toEqual([
      "Not handled yet9",
      "Acknowledged98",
      "Dismissed15",
      "Withdrawn before anyone handled it6",
    ]);
    expect(items("Who received them").map((li) => li.textContent)).toEqual([
      "Hospital queue97",
      "Named clinicians58",
    ]);
    expect(items("By kind of result")).toHaveLength(8);
  });

  it("gives every severity its icon beside its word, not colour alone (F3)", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    for (const s of SEVERITIES)
      expect(label(s).querySelector("svg")).not.toBeNull();
  });

  it("hides small groups as Fewer than 5, with no bar", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    const rows = items("By kind of result");
    const gases = rows.find((li) =>
      li.textContent?.startsWith("Blood gases and lactate"),
    )!;
    expect(gases).toHaveTextContent("Fewer than 5");
    expect(gases.querySelector("[aria-hidden]")).toBeNull();
    expect(rows[0]!.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("shows a hidden severity as Fewer than 5 (the edge sample)", async () => {
    const u = await mockAdminWith("edge").getUsage("this_month");
    render(<UsageAlerts usage={u} onRetry={vi.fn()} />);
    expect(tile("Critical")).toHaveTextContent("Fewer than 5");
    expect(tile("Urgent")).toHaveTextContent("Fewer than 5");
    expect(tile("Info")).toHaveTextContent("65");
  });

  it("offers Try again, never zeros, when alerts couldn't load (Review Focus 1)", async () => {
    const onRetry = vi.fn();
    const u = await mockAdminWith("unavailable").getUsage("this_month");
    const { container } = render(<UsageAlerts usage={u} onRetry={onRetry} />);
    expectCouldntLoad(container);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows nothing at all when a hidden value could be worked out (F7)", async () => {
    const one = await withAlerts((a) => ({
      by_handling: { ...a.by_handling, withdrawn: hidden },
    }));
    const { container, unmount } = render(
      <UsageAlerts usage={one} onRetry={vi.fn()} />,
    );
    expectCouldntLoad(container);
    unmount();
    const small = await withAlerts((a) => ({
      by_route: { ...a.by_route, named: { value: 2, suppressed: false } },
    }));
    const r = render(<UsageAlerts usage={small} onRetry={vi.fn()} />);
    expectCouldntLoad(r.container);
  });

  it("shows nothing when the hospital has no record source", async () => {
    const u = await mockAdminWith("off").getUsage("this_month");
    const { container } = render(<UsageAlerts usage={u} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses no backend terms and no lab wording", async () => {
    const { container } = render(
      <UsageAlerts usage={await usage()} onRetry={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    for (const t of FORBIDDEN_TERMS) expect(text).not.toContain(t);
    expect(text).not.toMatch(/\blab\b|_/i);
  });
});
