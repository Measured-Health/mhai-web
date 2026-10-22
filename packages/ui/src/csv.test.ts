import { describe, expect, it, vi, afterEach } from "vitest";
import { csvCell, downloadCsv, toCsv } from "./csv";

afterEach(() => vi.restoreAllMocks());

describe("CSV (R10)", () => {
  it("quotes what needs quoting", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("stops a spreadsheet from running a cell", () => {
    for (const bad of ['=HYPERLINK("x")', "+1", "-2", "@SUM(A1)", "\tx", "\rx"])
      expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell(-2)).toBe("-2"); // a real number stays a number
  });

  it("writes a UTF-8 file Excel opens, with CRLF lines", () => {
    expect(toCsv(["A", "B"], [["x", 1]])).toBe("\uFEFFA,B\r\nx,1\r\n");
  });

  it("downloads from memory and lets the URL go", async () => {
    const create = vi.fn(() => "blob:demo");
    const revoke = vi.fn();
    const original = [URL.createObjectURL, URL.revokeObjectURL] as const;
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    try {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      downloadCsv("x.csv", "a,b\r\n");
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledTimes(1);
      expect(document.querySelector("a[download]")).toBeNull();
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:demo"));
      expect(localStorage.length + sessionStorage.length).toBe(0);
    } finally {
      [URL.createObjectURL, URL.revokeObjectURL] = original;
    }
  });

  it("escapes a cell that really starts with a formula character", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});
