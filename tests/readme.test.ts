import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync("README.md", "utf8");

describe("README demo instructions", () => {
  it("sets NEXT_PUBLIC_USE_MOCK for the build (inlined at build time), not just start", () => {
    expect(readme).toContain(
      "NEXT_PUBLIC_USE_MOCK=true npm run build && npx next start",
    );
    expect(readme).not.toMatch(/npm run build && NEXT_PUBLIC_USE_MOCK=true/);
  });

  it("documents the whole-word triggers, with no bare 'review' trigger", () => {
    expect(readme).toMatch(/"potassium" gives Needs\s+review/);
    expect(readme).toMatch(/Words match whole/);
  });

  it("documents the review demo and its trigger word", () => {
    expect(readme).toMatch(/\*\*Review corrections\*\* in the sidebar/);
    expect(readme).toMatch(/contains the word "unsure"/);
  });

  it("documents the hospital admin demo and the 403 sample", () => {
    expect(readme).toMatch(
      /\*\*Hospital admin\.\*\* Sign in with the hospital admin sample/,
    );
    expect(readme).toMatch(/a platform admin \(the\s+403 page\)/);
    expect(readme).not.toMatch(/a hospital\s+admin \(the\s+403 page\)/);
  });

  it("says removing staff needs the admin's two-step code, and every admin needs two-step", () => {
    expect(readme).toMatch(
      /needs\s+your\s+own\s+two-step\s+code\s+\(in\s+the\s+demo,\s+`123456`\)/,
    );
    expect(readme).toMatch(/Every\s+hospital\s+admin\s+must\s+use\s+two-step/);
    expect(readme).toMatch(/a\s+new\s+hospital\s+admin\s+\(first\s+sign-in/);
  });

  it("documents the notifications demo, the pop-up rule and the sign-off gate", () => {
    expect(readme).toMatch(/\*\*Notifications and patient alerts\.\*\*/);
    expect(readme).toMatch(/a\s+new\s+one\s+arrives\s+every\s+2\s+minutes/);
    expect(readme).toMatch(/Critical\s+alerts\s+still\s+pop\s+up/);
  });

  it("pins each patient-alert sign-off item, and the gate before live use", () => {
    const section = readme.slice(readme.indexOf("### Patient alerts"));
    expect(section).toMatch(
      /clinical\s+and\s+privacy\s+sign-off\s+before\s+live\s+use/,
    );
    expect(section).toMatch(
      /-\s+names\s+and\s+MRNs\s+shown\s+in\s+alerts,\s+the\s+bell\s+and\s+pop-ups;/,
    );
    expect(section).toMatch(/-\s+alerts\s+kept\s+in\s+memory\s+only,/);
    expect(section).toMatch(
      /-\s+Critical\s+alerts\s+always\s+pop\s+up,\s+even\s+when\s+pop-ups\s+are\s+off;/,
    );
    expect(section).toMatch(
      /-\s+alerts\s+already\s+present\s+at\s+sign-in,\s+or\s+created\s+while\s+the\s+first\s+check\s+fails,\s+don't\s+pop\s+up\s+but\s+are\s+counted\s+on\s+the\s+bell\./,
    );
  });

  it("repeats the sign-off in CONTRIBUTING, with no lab wording", () => {
    const contributing = readFileSync("CONTRIBUTING.md", "utf8");
    expect(contributing).toMatch(
      /Clinical\s+and\s+privacy\s+sign-off\s+is\s+required\s+before\s+live\s+use/,
    );
    expect(contributing).toMatch(
      /needs\s+`clinical-review`\s+and\s+that\s+sign-off/,
    );
    expect(readme).not.toMatch(/\blab\b/i);
    expect(contributing).not.toMatch(/\blab\b/i);
  });
});
