import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useShortcuts } from "./use-shortcuts";

const press = (
  key: string,
  o: KeyboardEventInit = {},
  target: EventTarget = window,
) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...o }),
  );

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useShortcuts", () => {
  it("fires mod+k with Ctrl or Meta", () => {
    const f = vi.fn();
    renderHook(() => useShortcuts({ "mod+k": f }));
    press("k", { ctrlKey: true });
    press("k", { metaKey: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("ignores single letters while typing", () => {
    const f = vi.fn();
    renderHook(() => useShortcuts({ n: f }));
    const input = document.body.appendChild(document.createElement("textarea"));
    press("n", {}, input);
    expect(f).not.toHaveBeenCalled();
    press("n");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("ignores single letters in select and contenteditable", () => {
    const f = vi.fn();
    renderHook(() => useShortcuts({ n: f }));
    const sel = document.body.appendChild(document.createElement("select"));
    const ce = document.body.appendChild(document.createElement("div"));
    ce.contentEditable = "true";
    Object.defineProperty(ce, "isContentEditable", { value: true });
    press("n", {}, sel);
    press("n", {}, ce);
    expect(f).not.toHaveBeenCalled();
  });
  it("still fires mod+k and mod+p while typing", () => {
    const k = vi.fn();
    const p = vi.fn();
    renderHook(() => useShortcuts({ "mod+k": k, "mod+p": p }));
    const input = document.body.appendChild(document.createElement("input"));
    press("k", { ctrlKey: true }, input);
    press("p", { metaKey: true }, input);
    expect(k).toHaveBeenCalledTimes(1);
    expect(p).toHaveBeenCalledTimes(1);
  });
  it("ignores keys during IME composition", () => {
    const f = vi.fn();
    renderHook(() => useShortcuts({ n: f, "mod+k": f }));
    press("n", { isComposing: true });
    press("k", { ctrlKey: true, isComposing: true });
    expect(f).not.toHaveBeenCalled();
  });
  it("maps shift+c and ?", () => {
    const sc = vi.fn();
    const c = vi.fn();
    const q = vi.fn();
    renderHook(() => useShortcuts({ "shift+c": sc, c, "?": q }));
    press("C", { shiftKey: true });
    press("c");
    press("?", { shiftKey: true });
    expect(sc).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
    expect(q).toHaveBeenCalledTimes(1);
  });
  it("uses the latest map without re-subscribing", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = renderHook(({ f }) => useShortcuts({ n: f }), {
      initialProps: { f: a },
    });
    rerender({ f: b });
    press("n");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
