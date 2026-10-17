import { describe, expect, it } from "vitest";
import { INVITE_MAX, okEmails, parseInviteList } from "./invite";

const ctx = {
  existing: ["K.Mensah@havanahospital.org", "j.eze@havanahospital.org"],
  domains: ["havanahospital.org"],
};

describe("parseInviteList (Review Focus 3)", () => {
  it("splits on commas, semicolons, new lines and tabs, and skips blanks", () => {
    const lines = parseInviteList(
      "a@havanahospital.org, b@havanahospital.org;\n\n c@havanahospital.org\td@havanahospital.org,,",
      ctx,
    );
    expect(lines.map((l) => [l.email, l.status])).toEqual([
      ["a@havanahospital.org", "ok"],
      ["b@havanahospital.org", "ok"],
      ["c@havanahospital.org", "ok"],
      ["d@havanahospital.org", "ok"],
    ]);
  });

  it("reads names, angle brackets and mailto:, in any case", () => {
    const lines = parseInviteList(
      'Funmi Adeyemi <F.Adeyemi@HavanaHospital.org>\n"Obi, Ngozi" <n.obi@havanahospital.org>\nmailto:T.Bello@havanahospital.org\nAmaka Udo a.udo@havanahospital.org',
      ctx,
    );
    expect(okEmails(lines)).toEqual([
      "f.adeyemi@havanahospital.org",
      "n.obi@havanahospital.org",
      "t.bello@havanahospital.org",
      "a.udo@havanahospital.org",
    ]);
    expect(lines.every((l) => l.status === "ok")).toBe(true);
  });

  it("names every problem", () => {
    const lines = parseInviteList(
      [
        "n.ade@havanahospital.org",
        "N.ADE@havanahospital.org",
        "k.mensah@havanahospital.org",
        "j.eze@havanahospital.org",
        "someone@gmail.com",
        "f.adeyemi.havanahospital.org",
        "x@havanahospital",
      ].join("\n"),
      ctx,
    );
    expect(lines.map((l) => [l.email, l.status])).toEqual([
      ["n.ade@havanahospital.org", "ok"],
      ["n.ade@havanahospital.org", "duplicate"],
      ["k.mensah@havanahospital.org", "already_staff"],
      ["j.eze@havanahospital.org", "already_staff"],
      ["someone@gmail.com", "domain_not_allowed"],
      ["f.adeyemi.havanahospital.org", "invalid"],
      ["x@havanahospital", "invalid"],
    ]);
  });

  it("allows any domain when the hospital lists none", () => {
    expect(
      parseInviteList("someone@gmail.com", { existing: [], domains: [] })[0]!
        .status,
    ).toBe("ok");
  });

  it("keeps a typed invalid entry as typed, so the person can find it", () => {
    expect(parseInviteList("  Dr Funmi  ", ctx)[0]).toEqual({
      email: "Dr Funmi",
      status: "invalid",
    });
  });

  it("caps a send at 200", () => {
    expect(INVITE_MAX).toBe(200);
  });
});
