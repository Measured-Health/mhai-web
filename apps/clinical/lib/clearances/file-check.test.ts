import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { endDateProblem, fileProblem, letterDateProblem } from "./file-check";

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const file = (bytes: number[], name: string) =>
  new File([new Uint8Array(bytes)], name);

describe("fileProblem", () => {
  it("accepts PDF, PNG and JPEG by their first bytes", async () => {
    expect(await fileProblem(file(PDF, "a.pdf"))).toBeNull();
    expect(await fileProblem(file(PNG, "a.png"))).toBeNull();
    expect(await fileProblem(file(JPG, "a.jpg"))).toBeNull();
  });
  it("reads the bytes, not the name", async () => {
    expect(await fileProblem(file([1, 2, 3, 4], "letter.pdf"))).toBe(
      "This file type isn't accepted",
    );
    expect(await fileProblem(file(PDF, "letter.exe"))).toBeNull();
    expect(await fileProblem(file([], "empty.pdf"))).toBe(
      "This file type isn't accepted",
    );
  });
  it("refuses a file over 10 MB", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.pdf");
    expect(await fileProblem(big)).toBe("The file is larger than 10 MB");
    const edge = new Uint8Array(10 * 1024 * 1024);
    edge.set(PDF);
    expect(await fileProblem(new File([edge], "x.pdf"))).toBeNull();
  });
  it("reads only the first 8 bytes", async () => {
    const f = file(PDF, "a.pdf");
    const slice = vi.spyOn(f, "slice");
    await fileProblem(f);
    expect(slice).toHaveBeenCalledWith(0, 8);
  });
});

describe("endDateProblem", () => {
  const today = "2026-10-23";
  const max = "2027-10-23";
  it("needs a day after today", () => {
    expect(endDateProblem("2026-10-23", today, max)).toBe(
      "Choose an end date after today",
    );
    expect(endDateProblem("2026-10-22", today, max)).toBe(
      "Choose an end date after today",
    );
    expect(endDateProblem("", today, max)).toBe(
      "Choose an end date after today",
    );
    expect(endDateProblem("2026-10-24", today, max)).toBeNull();
  });
  it("at max is fine and one day past is refused", () => {
    expect(endDateProblem(max, today, max)).toBeNull();
    expect(endDateProblem("2027-10-24", today, max)).toBe(
      "The end date can't be more than 12 months away",
    );
  });
});

describe("letterDateProblem", () => {
  const today = "2026-10-23";
  const end = "2027-03-12";
  it("allows today and earlier", () => {
    expect(letterDateProblem("2026-10-23", today, end)).toBeNull();
    expect(letterDateProblem("2026-01-05", today, end)).toBeNull();
  });
  it("refuses a future date", () => {
    expect(letterDateProblem("2026-10-24", today, end)).toBe(
      "The letter date can't be in the future",
    );
  });
  it("a letter date after the end date is refused", () => {
    expect(letterDateProblem("2026-10-23", today, "2026-10-01")).toBe(
      "The letter date can't be after the end date",
    );
  });
  it("needs a real day", () => {
    expect(letterDateProblem("", today, end)).toBe("Enter the letter date");
  });
});
