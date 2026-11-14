import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HoldEvent } from "@/lib/api/holds-contract";
import { seedHolds } from "@/lib/api/holds-fixtures";
import { dateLabel } from "@/lib/format";
import { HoldHistory } from "./hold-history";

const now = Date.parse("2026-10-22T09:00:00Z");
const havana = seedHolds(now).find((h) => h.id === "hold_hh")!;

describe("HoldHistory", () => {
  it("events newest first: placed, asked, lifted (no released step: a lift lands at once)", () => {
    // Given oldest first: shown newest first all the same.
    render(
      <HoldHistory events={[...havana.history].reverse()} onRetry={() => {}} />,
    );
    const list = screen.getByRole("list", { name: "History" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("b")!.textContent)).toEqual([
      "Approved the lift: the hold was lifted",
      "Asked to lift the hold",
      "Placed the hold",
    ]);
    const lifted = havana.history[0]!;
    expect(items[0]).toHaveTextContent(
      `Ada Bakare · ${dateLabel(lifted.at)} · Case closed`,
    );
    expect(items[2]).toHaveTextContent(/^Placed the holdAda Bakare · /);
    // Core keeps no note on a hold.
    expect(havana.note).toBeNull();
  });

  it("an event this app doesn't know fails the block closed", () => {
    const odd = {
      ...havana.history[0]!,
      action: "shredded",
    } as unknown as HoldEvent;
    render(<HoldHistory events={[odd]} onRetry={() => {}} />);
    expect(screen.getByText("Couldn't load history.")).toBeInTheDocument();
    expect(screen.queryByText(/shredded/)).toBeNull();
  });
});
