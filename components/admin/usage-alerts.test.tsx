import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UsageAlertsOut, UsageOut } from "@/lib/api/admin-contract";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { mockAdminAs, mockAdminWith } from "@/tests/admin";
import { UsageAlerts } from "./usage-alerts";

const usage = (p: UsageOut["period"] = "this_month") =>
  mockAdminAs(null).getUsage(p);
const edge = (p: UsageOut["period"] = "this_month") =>
  mockAdminWith("edge").getUsage(p);
const withAlerts = async (
  over: (a: UsageAlertsOut) => Record<string, unknown>,
  p: UsageOut["period"] = "this_month",
): Promise<UsageOut> => {
  const u = await usage(p);
  const a = u.alerts as UsageAlertsOut;
  return { ...u, alerts: { ...a, ...over(a) } as UsageAlertsOut };
};
const hiddenMeasure = { value: null, suppressed: true, change: null };
const label = (text: string) => screen.getByText(text, { selector: "span" });
const tile = (text: string) => label(text).closest("div")!;
const group = () => screen.getByRole("region", { name: "Patient alerts" });
const changed = () => screen.getByRole("region", { name: "What changed" });
const items = (name: string) =>
  within(screen.getByRole("region", { name }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
const SEVERITIES = ["Critical", "Urgent", "Info"] as const;

function expectCouldntLoad(container: HTMLElement) {
  expect(
    within(group()).getByText("Couldn't load patient alerts"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Nothing unusual this period")).toBeNull();
  expect(screen.queryByText("Fewer than 5")).toBeNull();
  expect(screen.queryByRole("region", { name: "What changed" })).toBeNull();
  // The intro's "fewer than 5" is the only number.
  expect(container.textContent?.replace("fewer than 5", "")).not.toMatch(/\d/);
}

describe("UsageAlerts", () => {
  it("shows this month's alerts, with what changed at the top", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    expect(
      within(group()).getByText(
        "Counts for your hospital only. Groups of fewer than 5 are hidden.",
      ),
    ).toBeInTheDocument();
    expect(items("What changed")).toEqual([
      "Critical within 15 min: 71%, down from 88%",
      "14 Oct: 23 alerts, about 3× the usual",
      "Potassium · low: 31, up from 9",
      "Ward 3: 34, up from 12",
    ]);
    // What changed comes first in the group.
    expect(group().querySelector("section")).toBe(changed());
    expect(tile("Alerts")).toHaveTextContent("128");
    expect(tile("Alerts")).toHaveTextContent("up 35% vs last month");
    expect(tile("Alerts")).not.toHaveTextContent(/better|worse/);
    expect(tile("Critical")).toHaveTextContent("17");
    expect(tile("Critical")).toHaveTextContent("up 42% vs last month");
    expect(tile("Still unhandled")).toHaveTextContent("9");
    expect(tile("Still unhandled")).not.toHaveTextContent(/vs last month/);
    expect(tile("Median time to acknowledge")).toHaveTextContent("22 min");
    expect(tile("Median time to acknowledge")).toHaveTextContent(
      "up 6 min vs last month · worse",
    );
    expect(tile("Median for Critical alerts")).toHaveTextContent(
      "up 3 min vs last month · worse",
    );
    expect(tile("Critical handled within 15 min")).toHaveTextContent("71%");
    expect(tile("Critical handled within 15 min")).toHaveTextContent(
      "down 17 points vs last month · worse",
    );
    // Outcomes carry their change too (F8), neutral: neither better nor worse.
    expect(items("Outcomes")).toEqual([
      "Acknowledged82%down 3 points vs last month",
      "Dismissed18%up 3 points vs last month",
    ]);
    expect(items("Top findings")).toEqual([
      "Potassium · low31",
      "Sodium · low24",
      "Platelets · low18",
      "Not standardised11",
      "Haemoglobin · lowFewer than 5",
    ]);
    expect(items("Top locations")).toEqual([
      "Ward 334",
      "Emergency department29",
      "Ward 521",
      "Location not recorded8",
      "Outpatient · Cardiology clinicFewer than 5",
    ]);
  });

  it("gives every severity its icon beside its word, not colour alone (F3)", async () => {
    for (const p of ["this_month", "last_90_days"] as const) {
      const { unmount } = render(
        <UsageAlerts usage={await usage(p)} onRetry={vi.fn()} />,
      );
      for (const s of SEVERITIES)
        expect(label(s).querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("stacks the volume tiles to one column on phones (F16)", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    const grid = tile("Alerts").parentElement!;
    expect(grid.className).toMatch(/(^| )grid-cols-1( |$)/);
    expect(grid.className).toContain("sm:grid-cols-2");
  });

  it("hides small groups as Fewer than 5, with no bar", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    const reasons = screen.getByRole("region", { name: "Dismissal reasons" });
    const rows = within(reasons).getAllByRole("listitem");
    expect(rows.map((li) => li.textContent)).toEqual([
      "Not clinically relevant9",
      "Already known7",
      "Wrong patientFewer than 5",
      "OtherFewer than 5",
    ]);
    expect(rows[2]!.querySelector("[aria-hidden]")).toBeNull();
    expect(rows[0]!.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("shows hidden measures as Fewer than 5 and an empty median as No data yet, with no change", async () => {
    render(<UsageAlerts usage={await edge()} onRetry={vi.fn()} />);
    expect(tile("Critical")).toHaveTextContent(/^Fewer than 5Critical$/);
    expect(tile("Urgent")).toHaveTextContent(/^Fewer than 5Urgent$/);
    expect(tile("Info")).toHaveTextContent("65");
    expect(tile("Info")).toHaveTextContent("up 44% vs last month");
    expect(tile("Alerts")).toHaveTextContent("128");
    expect(tile("Median time to acknowledge")).toHaveTextContent(
      /^No data yetMedian time to acknowledge$/,
    );
    expect(tile("Median for Critical alerts")).toHaveTextContent(
      /^Fewer than 5Median for Critical alerts$/,
    );
    // Never a 0 for nothing measured.
    expect(tile("Median time to acknowledge")).not.toHaveTextContent(/\d/);
  });

  it("draws no bar and no change beside any Fewer than 5 (G7)", async () => {
    const u = await edge();
    const a = u.alerts as UsageAlertsOut;
    const change = { direction: "up", amount: 10, previous: 36 } as const;
    // The server wrongly sends changes with hidden values: none may show.
    const hiddenWithChange = { value: 40, suppressed: true, change };
    render(
      <UsageAlerts
        usage={{
          ...u,
          alerts: {
            ...a,
            by_severity: { ...a.by_severity, urgent: hiddenWithChange },
            median_ack_minutes_critical: hiddenWithChange,
            acknowledged_share: hiddenWithChange,
            dismissed_share: hiddenWithChange,
          },
        }}
        onRetry={vi.fn()}
      />,
    );
    const hidden = screen.getAllByText("Fewer than 5");
    // Critical, Urgent, the Critical median and share tiles; two outcomes,
    // two reasons, a finding and a location row.
    expect(hidden).toHaveLength(10);
    for (const el of hidden) {
      const box = (el.closest("li") ?? el.closest(".card-v3"))!;
      expect(box).not.toHaveTextContent(/ vs |\bup\b|\bdown\b|point/);
      expect(box.querySelector(".rounded-full")).toBeNull();
      expect(box.querySelector("[class*='lucide-arrow']")).toBeNull();
    }
  });

  it("charts the days, marking the busy one", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    const chart = screen.getByRole("region", { name: "Alerts over time" });
    expect(within(chart).getByText("Most alerts on 14 Oct: 23")).toBeVisible();
    expect(
      within(chart).getByRole("listitem", {
        name: "14 Oct: 23 alerts, about 3× the usual",
      }),
    ).toBeInTheDocument();
    expect(within(chart).getByText("Unusually busy")).toBeVisible();
    await userEvent.click(
      within(chart).getByRole("button", { name: "Show as table" }),
    );
    expect(within(chart).getAllByRole("columnheader")[0]).toHaveTextContent(
      "Day",
    );
  });

  it("says Nothing unusual this period when nothing is flagged, and shows a real 0", async () => {
    render(<UsageAlerts usage={await usage("last_month")} onRetry={vi.fn()} />);
    expect(
      within(changed()).getByText("Nothing unusual this period"),
    ).toBeInTheDocument();
    expect(tile("Still unhandled")).toHaveTextContent(/^0Still unhandled$/);
    expect(tile("Median time to acknowledge")).toHaveTextContent(
      "down 2 min vs the month before · better",
    );
    expect(screen.queryByText("Unusually busy")).toBeNull();
  });

  it("says Not enough data to compare, with no changes or flags, without a previous period (Review Focus 3)", async () => {
    // The backend wrongly still sends changes and flags: none may show.
    const tm = (await usage()).alerts as UsageAlertsOut;
    render(
      <UsageAlerts
        usage={await withAlerts(
          () => ({
            has_previous: false,
            total: tm.total,
            rising: tm.rising,
            worsening: tm.worsening,
            series: tm.series,
          }),
          "last_90_days",
        )}
        onRetry={vi.fn()}
      />,
    );
    expect(
      within(changed()).getByText("Not enough data to compare"),
    ).toBeInTheDocument();
    expect(within(changed()).queryByRole("listitem")).toBeNull();
    expect(screen.queryByText(/ vs (last month|the )/)).toBeNull();
    expect(screen.queryByText("Unusually busy")).toBeNull();
  });

  it("marks no week as busy without a previous period, even when one is flagged", async () => {
    const u = await edge("last_90_days");
    const flagged = {
      ...u,
      alerts: { ...(u.alerts as UsageAlertsOut), has_previous: false },
    };
    render(<UsageAlerts usage={flagged} onRetry={vi.fn()} />);
    expect(
      within(changed()).getByText("Not enough data to compare"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unusually busy")).toBeNull();
    expect(screen.queryByText(/the usual/)).toBeNull();
  });

  it("shows the edge week as busy, with its line, when there is a previous period", async () => {
    render(
      <UsageAlerts usage={await edge("last_90_days")} onRetry={vi.fn()} />,
    );
    expect(items("What changed")).toEqual([
      "Week of 3 Oct: 45 alerts, about 2× the usual",
    ]);
    expect(screen.getByText("Unusually busy")).toBeInTheDocument();
  });

  it("never reads as zero or Nothing unusual when alerts couldn't load (Review Focus 1)", async () => {
    const onRetry = vi.fn();
    const u = await mockAdminWith("unavailable").getUsage("this_month");
    const { container } = render(<UsageAlerts usage={u} onRetry={onRetry} />);
    expectCouldntLoad(container);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says couldn't load for a half-built series or flag, never zero or calm (F4, F5)", async () => {
    for (const over of [
      (a: UsageAlertsOut) => ({
        series: {
          ...a.series,
          points: a.series.points.map((p) => ({ ...p, total: null })),
        },
      }),
      (a: UsageAlertsOut) => ({ series: { ...a.series, bucket: "month" } }),
      (a: UsageAlertsOut) => ({
        rising: a.rising.map((r) => ({ ...r, count: "lots" })),
      }),
      () => ({ worsening: { value: 0.71 } }),
      () => ({ critical_target_minutes: Number.NaN }),
      // Flags the guards would drop: never "Nothing unusual".
      () => ({
        critical_within_target: {
          value: 0.71,
          suppressed: false,
          change: null,
        },
      }),
      () => ({ worsening: { value: 0.9, previous: 0.88 } }),
      () => ({
        worsening: null,
        rising: [
          {
            kind: "finding",
            name: "Sodium",
            flag: "low",
            count: 3,
            previous: 9,
          },
        ],
      }),
    ]) {
      const { container, unmount } = render(
        <UsageAlerts usage={await withAlerts(over)} onRetry={vi.fn()} />,
      );
      expectCouldntLoad(container);
      unmount();
    }
  });

  it("shows nothing when alerts aren't switched on", async () => {
    const u = await usage();
    const { container, rerender } = render(
      <UsageAlerts usage={{ ...u, alerts: null }} onRetry={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    const older: UsageOut = { ...u };
    delete older.alerts;
    rerender(<UsageAlerts usage={older} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never shows a small number or its change, even if one is sent (Review Focus 2)", async () => {
    render(
      <UsageAlerts
        usage={await withAlerts((a) => ({
          by_severity: {
            critical: { value: null, suppressed: true, change: null },
            // Suppressed wins over the number sent with it.
            urgent: {
              value: 40,
              suppressed: true,
              change: { direction: "up", amount: 10, previous: 36 },
            },
            info: a.by_severity.info,
          },
          // Computed over the hidden Critical group, so hidden too (G1).
          median_ack_minutes_critical: hiddenMeasure,
          critical_within_target: hiddenMeasure,
          worsening: null,
          // A raw 1 to 4 outside a set that adds up still reads Fewer than 5.
          unhandled: {
            value: 3,
            suppressed: false,
            change: { direction: "up", amount: 50, previous: 2 },
          },
          top_findings: [
            {
              name: "Sodium",
              flag: "low",
              count: { value: 2, suppressed: false },
            },
          ],
        }))}
        onRetry={vi.fn()}
      />,
    );
    expect(tile("Critical")).toHaveTextContent(/^Fewer than 5Critical$/);
    expect(tile("Urgent")).toHaveTextContent(/^Fewer than 5Urgent$/);
    expect(tile("Info")).toHaveTextContent("up 44% vs last month");
    expect(tile("Still unhandled")).toHaveTextContent(
      /^Fewer than 5Still unhandled$/,
    );
    expect(items("Top findings")).toEqual(["Sodium · lowFewer than 5"]);
  });

  it("writes a change that rounds to nothing as no change, with no arrow up and no verdict", async () => {
    render(
      <UsageAlerts
        usage={await withAlerts(() => ({
          median_ack_minutes: {
            value: 22,
            suppressed: false,
            change: { direction: "up", amount: 0.3, previous: 21.7 },
          },
        }))}
        onRetry={vi.fn()}
      />,
    );
    const t = tile("Median time to acknowledge");
    expect(t).toHaveTextContent("no change vs last month");
    expect(t).not.toHaveTextContent(/worse|better|up /);
    expect(t.querySelector(".lucide-arrow-up")).toBeNull();
    expect(t.querySelector(".lucide-arrow-right")).not.toBeNull();
  });

  it("shows no count change from a previous 0 (spec §5.1)", async () => {
    render(
      <UsageAlerts
        usage={await withAlerts(() => ({
          unhandled: {
            value: 9,
            suppressed: false,
            change: { direction: "up", amount: 100, previous: 0 },
          },
        }))}
        onRetry={vi.fn()}
      />,
    );
    expect(tile("Still unhandled")).toHaveTextContent(/^9Still unhandled$/);
  });

  it("shows nothing at all when a hidden value could be worked out from the totals (F7)", async () => {
    // Info sent as a raw 3: even written "Fewer than 5", it is still
    // Alerts - Critical - Urgent from the tiles beside it.
    for (const over of [
      (a: UsageAlertsOut) => ({
        by_severity: {
          ...a.by_severity,
          info: { value: 3, suppressed: false, change: null },
        },
      }),
      (a: UsageAlertsOut) => ({
        by_severity: {
          ...a.by_severity,
          critical: { value: null, suppressed: true, change: null },
        },
      }),
      () => ({
        dismissed_share: { value: null, suppressed: true, change: null },
      }),
    ]) {
      const { container, unmount } = render(
        <UsageAlerts usage={await withAlerts(over)} onRetry={vi.fn()} />,
      );
      expectCouldntLoad(container);
      unmount();
    }
  });

  it("uses the hospital's own target in the labels", async () => {
    render(
      <UsageAlerts
        usage={await withAlerts(() => ({ critical_target_minutes: 10 }))}
        onRetry={vi.fn()}
      />,
    );
    expect(tile("Critical handled within 10 min")).toHaveTextContent("71%");
    expect(
      within(changed()).getByText("Critical within 10 min: 71%, down from 88%"),
    ).toBeInTheDocument();
  });

  it("uses no backend terms and no lab wording", async () => {
    const { container } = render(
      <UsageAlerts usage={await usage()} onRetry={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    for (const t of FORBIDDEN_TERMS) expect(text).not.toContain(t);
    expect(text).not.toMatch(/\blab\b/i);
  });
});
