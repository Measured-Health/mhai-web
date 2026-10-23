import { describe, expect, it, vi, afterEach } from "vitest";
import { REVOKE_MS, csvCell, downloadBlob, downloadCsv, toCsv } from "./csv";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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

  it("downloads from memory and lets the URL go", () => {
    const create = vi.fn(() => "blob:demo");
    const revoke = vi.fn();
    const original = [URL.createObjectURL, URL.revokeObjectURL] as const;
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    vi.useFakeTimers();
    try {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      downloadCsv("x.csv", "a,b\r\n");
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledTimes(1);
      expect(document.querySelector("a[download]")).toBeNull();
      // Kept a while (a late-starting save still finds it), then let go.
      vi.advanceTimersByTime(REVOKE_MS - 1);
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(revoke).toHaveBeenCalledWith("blob:demo");
      expect(localStorage.length + sessionStorage.length).toBe(0);
    } finally {
      [URL.createObjectURL, URL.revokeObjectURL] = original;
    }
  });

  it("downloadCsv still downloads; downloadBlob names the file", () => {
    const blobs: Blob[] = [];
    const names: string[] = [];
    const original = [URL.createObjectURL, URL.revokeObjectURL] as const;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return `blob:${blobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function (this: HTMLAnchorElement) {
          names.push(this.download);
        },
      );
      downloadCsv("a.csv", "x\r\n");
      const zip = new Blob(["PK"], { type: "application/zip" });
      downloadBlob("audit-named-access-exp_1.zip", zip);
      expect(names).toEqual(["a.csv", "audit-named-access-exp_1.zip"]);
      expect(blobs[0].type).toBe("text/csv;charset=utf-8");
      // The blob is handed over as given, its type kept.
      expect(blobs[1]).toBe(zip);
      expect(document.querySelector("a[download]")).toBeNull();
      vi.advanceTimersByTime(REVOKE_MS);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    } finally {
      [URL.createObjectURL, URL.revokeObjectURL] = original;
    }
  });

  it("escapes a cell that really starts with a formula character", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});
