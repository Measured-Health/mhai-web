import { render, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { MobileDrawer } from "@/components/shell/mobile-drawer";
import { AuthTestProvider } from "@/tests/auth-wrapper";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
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
  it("ignores auto-repeat and already-handled events", () => {
    const f = vi.fn();
    renderHook(() => useShortcuts({ n: f }));
    press("n", { repeat: true });
    press("n", { cancelable: true });
    expect(f).toHaveBeenCalledTimes(1);
    const h = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", h, true);
    press("n", { cancelable: true });
    window.removeEventListener("keydown", h, true);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("disables plain keys behind a modal but keeps mod combos", () => {
    const n = vi.fn();
    const k = vi.fn();
    renderHook(() => useShortcuts({ n, "mod+k": k }));
    const m = document.body.appendChild(document.createElement("div"));
    m.setAttribute("aria-modal", "true");
    press("n");
    press("k", { ctrlKey: true });
    expect(n).not.toHaveBeenCalled();
    expect(k).toHaveBeenCalledTimes(1);
    m.remove();
    const d = document.body.appendChild(document.createElement("dialog"));
    d.setAttribute("open", "");
    press("n");
    expect(n).not.toHaveBeenCalled();
    d.remove();
    press("n");
    expect(n).toHaveBeenCalledTimes(1);
  });
  describe("modal guard and hidden modals", () => {
    const modalIn = (wrapperAttr: Record<string, string>) => {
      const w = document.body.appendChild(document.createElement("div"));
      for (const [k, v] of Object.entries(wrapperAttr)) w.setAttribute(k, v);
      const m = w.appendChild(document.createElement("div"));
      m.setAttribute("aria-modal", "true");
      return w;
    };
    it.each([
      ["inert", { inert: "" }],
      ["aria-hidden", { "aria-hidden": "true" }],
    ])("a modal inside an %s wrapper does not block plain keys", (_n, attr) => {
      const f = vi.fn();
      renderHook(() => useShortcuts({ n: f }));
      modalIn(attr);
      press("n");
      expect(f).toHaveBeenCalledTimes(1);
    });
    it("a modal in a visible wrapper (an open drawer) blocks plain keys", () => {
      const f = vi.fn();
      renderHook(() => useShortcuts({ n: f }));
      modalIn({});
      press("n");
      expect(f).not.toHaveBeenCalled();
    });
    it("a real open MobileDrawer blocks plain keys, a closed one does not", () => {
      const f = vi.fn();
      renderHook(() => useShortcuts({ n: f }));
      const { rerender } = render(
        createElement(MobileDrawer, {
          open: false,
          onClose() {},
          items: [],
        }),
        { wrapper: AuthTestProvider },
      );
      press("n");
      expect(f).toHaveBeenCalledTimes(1);
      rerender(
        createElement(MobileDrawer, { open: true, onClose() {}, items: [] }),
      );
      press("n");
      expect(f).toHaveBeenCalledTimes(1);
    });
  });
});
