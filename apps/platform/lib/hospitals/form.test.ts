import { describe, expect, it } from "vitest";
import { parseHospitalForm, splitDomains, type FormValues } from "./form";

const OK: FormValues = {
  name: "  Lakeside Hospital ",
  shortCode: " lake1 ",
  country: "NG",
  timeZone: "Africa/Lagos",
  domains: "Lakeside.org, mail.lakeside.org\nLAKESIDE.org",
  adminName: " Ada ",
  adminEmail: " Ada@Lakeside.org ",
};

describe("splitDomains", () => {
  it("splits on commas and new lines, trims, lower-cases and de-duplicates", () => {
    expect(splitDomains(" A.org,b.org\r\n\nB.ORG , ,c-d.co.uk ")).toEqual([
      "a.org",
      "b.org",
      "c-d.co.uk",
    ]);
  });
});

describe("parseHospitalForm", () => {
  it("normalises what is sent", () => {
    expect(parseHospitalForm(OK)).toEqual({
      ok: true,
      value: {
        name: "Lakeside Hospital",
        short_code: "LAKE1",
        country: "NG",
        time_zone: "Africa/Lagos",
        email_domains: ["lakeside.org", "mail.lakeside.org"],
        first_admin: { name: "Ada", email: "ada@lakeside.org" },
      },
    });
  });
  it("refuses a name over 120 characters or empty", () => {
    const r = parseHospitalForm({ ...OK, name: "x".repeat(121) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["name"]);
    expect(parseHospitalForm({ ...OK, name: "   " }).ok).toBe(false);
    expect(parseHospitalForm({ ...OK, name: "x".repeat(120) }).ok).toBe(true);
  });
  it("refuses a bad short code, domain or email", () => {
    for (const bad of [
      { shortCode: "A" },
      { shortCode: "TOOLONG123" },
      { shortCode: "AB-1" },
      { domains: "not a domain" },
      { domains: "localhost" },
      { adminEmail: "nope" },
      { adminName: " " },
    ]) {
      const r = parseHospitalForm({ ...OK, ...bad });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("allows no domains", () => {
    const r = parseHospitalForm({ ...OK, domains: "" });
    expect(r.ok && r.value.email_domains).toEqual([]);
  });
});
