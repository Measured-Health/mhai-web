import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LetterViewer } from "./letter-viewer";

const png = (n: number) => new Blob([`page ${n}`], { type: "image/png" });

let made: string[];
let revoked: string[];
const original = [URL.createObjectURL, URL.revokeObjectURL] as const;

beforeEach(() => {
  made = [];
  revoked = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${made.length + 1}`;
    made.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  [URL.createObjectURL, URL.revokeObjectURL] = original;
});

function view(loadPage: (n: number) => Promise<Blob>, onClose = vi.fn()) {
  const utils = render(
    <LetterViewer
      title="Clearance letter"
      pages={3}
      loadPage={loadPage}
      onClose={onClose}
    />,
  );
  return { ...utils, onClose };
}

describe("LetterViewer", () => {
  it("shows page 1 of 3 and fetches only page 1", async () => {
    const loadPage = vi.fn(async (n: number) => png(n));
    view(loadPage);
    const img = await screen.findByAltText("Page 1 of 3");
    expect(img).toHaveAttribute("src", "blob:test/1");
    expect(img).toHaveAttribute("draggable", "false");
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(loadPage).toHaveBeenCalledWith(1);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("Next fetches page 2 and revokes page 1's URL", async () => {
    const loadPage = vi.fn(async (n: number) => png(n));
    view(loadPage);
    await screen.findByAltText("Page 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const img = await screen.findByAltText("Page 2 of 3");
    expect(img).toHaveAttribute("src", "blob:test/2");
    expect(loadPage).toHaveBeenLastCalledWith(2);
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(revoked).toEqual(["blob:test/1"]);
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByAltText("Page 1 of 3");
    expect(revoked).toEqual(["blob:test/1", "blob:test/2"]);
  });

  it("the last page has no Next", async () => {
    const loadPage = vi.fn(async (n: number) => png(n));
    view(loadPage);
    await screen.findByAltText("Page 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByAltText("Page 2 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByAltText("Page 3 of 3");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("the first focus is on Close, not the disabled Previous", async () => {
    view(async (n) => png(n));
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await screen.findByAltText("Page 1 of 3");
  });

  it("closing revokes the URL", async () => {
    const order: string[] = [];
    URL.revokeObjectURL = vi.fn((url: string) => {
      order.push(`revoke ${url}`);
    });
    view(
      async (n) => png(n),
      vi.fn(() => order.push("close")),
    );
    await screen.findByAltText("Page 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(order).toEqual(["revoke blob:test/1", "close"]);
  });

  it("paging to the last page by keyboard keeps the focus in the viewer", async () => {
    view(async (n) => png(n));
    await screen.findByAltText("Page 1 of 3");
    const prev = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    next.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByAltText("Page 2 of 3");
    expect(next).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await screen.findByAltText("Page 3 of 3");
    expect(next).toBeDisabled();
    expect(prev).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await screen.findByAltText("Page 2 of 3");
    expect(prev).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await screen.findByAltText("Page 1 of 3");
    expect(prev).toBeDisabled();
    expect(next).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("a page that can't be decoded shows Couldn't show this page", async () => {
    view(async (n) => png(n));
    fireEvent.error(await screen.findByAltText("Page 1 of 3"));
    expect(
      await screen.findByText("Couldn't show this page"),
    ).toBeInTheDocument();
  });

  it("a page count that isn't a number reads as one page", async () => {
    render(
      <LetterViewer
        title="Clearance letter"
        pages={Number.NaN}
        loadPage={async (n) => png(n)}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByAltText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("unmounting revokes the URL", async () => {
    const { unmount } = view(async (n) => png(n));
    await screen.findByAltText("Page 1 of 3");
    unmount();
    expect(revoked).toEqual(["blob:test/1"]);
  });

  it("a page that arrives after the viewer moved on is never shown", async () => {
    let finish: (b: Blob) => void = () => {};
    const loadPage = vi.fn((n: number) =>
      n === 1
        ? new Promise<Blob>((r) => (finish = r))
        : Promise.resolve(png(n)),
    );
    view(loadPage);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByAltText("Page 2 of 3");
    await act(async () => finish(png(1)));
    expect(screen.queryByAltText("Page 1 of 3")).not.toBeInTheDocument();
    expect(made).toHaveLength(1); // page 2's only
  });

  it("a text/html blob shows Couldn't show this page", async () => {
    view(async () => new Blob(["<script>x</script>"], { type: "text/html" }));
    expect(
      await screen.findByText("Couldn't show this page"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("accepts PNG, JPEG and SVG pages", async () => {
    for (const type of [
      "image/png",
      "image/jpeg",
      "image/svg+xml",
      "image/svg+xml;charset=utf-8",
    ]) {
      const { unmount } = view(async () => new Blob(["x"], { type }));
      expect(await screen.findByAltText("Page 1 of 3")).toBeInTheDocument();
      unmount();
    }
  });

  it("a failed load shows Try again, which reloads", async () => {
    const loadPage = vi
      .fn<(n: number) => Promise<Blob>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(png(1));
    view(loadPage);
    expect(
      await screen.findByText("Couldn't show this page"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByAltText("Page 1 of 3")).toBeInTheDocument();
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(loadPage).toHaveBeenLastCalledWith(1);
  });

  it("there is no download or print control", async () => {
    view(async (n) => png(n));
    await screen.findByAltText("Page 1 of 3");
    const names = screen
      .getAllByRole("button")
      .map((b) => b.textContent + " " + (b.getAttribute("aria-label") ?? ""));
    for (const n of names) expect(n).not.toMatch(/download|print|open|save/i);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.querySelector("a, [download]")).toBeNull();
  });

  it("it is hidden in print", async () => {
    view(async (n) => png(n));
    await screen.findByAltText("Page 1 of 3");
    const dialog = screen.getByRole("dialog", { name: "Clearance letter" });
    expect(dialog).toHaveClass("print:hidden");
  });

  it("is a full-width dialog below md, not a sheet", async () => {
    view(async (n) => png(n));
    await screen.findByAltText("Page 1 of 3");
    const dialog = screen.getByRole("dialog", { name: "Clearance letter" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveClass("max-md:w-full");
  });

  it("nothing is fetched again when the parent re-renders", async () => {
    const loadPage = vi.fn(async (n: number) => png(n));
    const { rerender } = view(loadPage);
    await screen.findByAltText("Page 1 of 3");
    rerender(
      <LetterViewer
        title="Clearance letter"
        pages={3}
        loadPage={(n) => loadPage(n)}
        onClose={() => {}}
      />,
    );
    expect(loadPage).toHaveBeenCalledTimes(1);
  });
});
