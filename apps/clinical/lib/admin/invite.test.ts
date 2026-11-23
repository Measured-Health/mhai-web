import { describe, expect, it } from "vitest";
import { INVITE_MAX, okEmails, parseInviteList } from "./invite";

const ctx = {
  existing: ["K.Mensah@pilot-hospital.example", "j.eze@pilot-hospital.example"],
  domains: ["pilot-hospital.example"],
};

describe("parseInviteList (Review Focus 3)", () => {
  it("splits on commas, semicolons, new lines and tabs, and skips blanks", () => {
    const lines = parseInviteList(
      "a@pilot-hospital.example, b@pilot-hospital.example;\n\n c@pilot-hospital.example\td@pilot-hospital.example,,",
      ctx,
    );
    expect(lines.map((l) => [l.email, l.status])).toEqual([
      ["a@pilot-hospital.example", "ok"],
      ["b@pilot-hospital.example", "ok"],
      ["c@pilot-hospital.example", "ok"],
      ["d@pilot-hospital.example", "ok"],
    ]);
  });

  it("reads names, angle brackets and mailto:, in any case", () => {
    const lines = parseInviteList(
      'Funmi Adeyemi <F.Adeyemi@Pilot-Hospital.example>\n"Obi, Ngozi" <n.obi@pilot-hospital.example>\nmailto:T.Bello@pilot-hospital.example\nAmaka Udo a.udo@pilot-hospital.example',
      ctx,
    );
    expect(okEmails(lines)).toEqual([
      "f.adeyemi@pilot-hospital.example",
      "n.obi@pilot-hospital.example",
      "t.bello@pilot-hospital.example",
      "a.udo@pilot-hospital.example",
    ]);
    expect(lines.every((l) => l.status === "ok")).toBe(true);
  });

  it("names every problem", () => {
    const lines = parseInviteList(
      [
        "n.ade@pilot-hospital.example",
        "N.ADE@pilot-hospital.example",
        "k.mensah@pilot-hospital.example",
        "j.eze@pilot-hospital.example",
        "someone@gmail.com",
        "f.adeyemi.pilot-hospital.example",
        "x@pilot-hospital",
      ].join("\n"),
      ctx,
    );
    expect(lines.map((l) => [l.email, l.status])).toEqual([
      ["n.ade@pilot-hospital.example", "ok"],
      ["n.ade@pilot-hospital.example", "duplicate"],
      ["k.mensah@pilot-hospital.example", "already_staff"],
      ["j.eze@pilot-hospital.example", "already_staff"],
      ["someone@gmail.com", "domain_not_allowed"],
      ["f.adeyemi.pilot-hospital.example", "invalid"],
      ["x@pilot-hospital", "invalid"],
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

  it("gives each space-separated address its own line", () => {
    const L = (t: string) =>
      parseInviteList(t, ctx).map((l) => [l.email, l.status]);
    const want = [
      ["a@pilot-hospital.example", "ok"],
      ["b@pilot-hospital.example", "ok"],
    ];
    expect(L("a@pilot-hospital.example b@pilot-hospital.example")).toEqual(
      want,
    );
    expect(L("a@pilot-hospital.example\u00A0b@pilot-hospital.example")).toEqual(
      want,
    );
    expect(
      L("a@pilot-hospital.example b@gmail.com a@pilot-hospital.example"),
    ).toEqual([
      ["a@pilot-hospital.example", "ok"],
      ["b@gmail.com", "domain_not_allowed"],
      ["a@pilot-hospital.example", "duplicate"],
    ]);
    expect(L("a@pilot-hospital.example b@pilot-hospital")).toEqual([
      ["a@pilot-hospital.example", "ok"],
      ["b@pilot-hospital", "invalid"],
    ]);
  });

  it("treats fullwidth separators as separators", () => {
    for (const sep of ["\uFF0C", "\uFF1B", "\u3001"])
      expect(
        okEmails(
          parseInviteList(
            `a@pilot-hospital.example${sep}b@pilot-hospital.example`,
            ctx,
          ),
        ),
      ).toEqual(["a@pilot-hospital.example", "b@pilot-hospital.example"]);
  });

  it("never drops stray text before an <address> silently", () => {
    expect(
      parseInviteList("junk, Ann <a@pilot-hospital.example>", ctx).map((l) => [
        l.email,
        l.status,
      ]),
    ).toEqual([
      ["junk", "invalid"],
      ["a@pilot-hospital.example", "ok"],
    ]);
  });
});
