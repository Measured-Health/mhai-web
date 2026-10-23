import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// README and CONTRIBUTING live at the repository root.
const repositoryRoot = path.join(import.meta.dirname, "../../..");
const readme = readFileSync(path.join(repositoryRoot, "README.md"), "utf8");

describe("README demo instructions", () => {
  it("documents the workspaces and where the app lives", () => {
    expect(readme).toMatch(/apps\/clinical/);
    expect(readme).toMatch(/packages\/tokens/);
  });

  it("says to move .env.local into apps/clinical", () => {
    expect(readme).toMatch(/`\.env\.local`[^.]*apps\/clinical\//);
  });

  it("sets NEXT_PUBLIC_USE_MOCK for the build (inlined at build time), not just start", () => {
    expect(readme).toContain(
      "NEXT_PUBLIC_USE_MOCK=true npm run build && npm start",
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
    expect(readme).toMatch(/Eight\s+sample\s+alerts,\s+six\s+of\s+them\s+new/);
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
    const contributing = readFileSync(
      path.join(repositoryRoot, "CONTRIBUTING.md"),
      "utf8",
    );
    expect(contributing).toMatch(
      /Clinical\s+and\s+privacy\s+sign-off\s+is\s+required\s+before\s+live\s+use/,
    );
    expect(contributing).toMatch(
      /needs\s+`clinical-review`\s+and\s+that\s+sign-off/,
    );
    expect(readme).not.toMatch(/\blab\b/i);
    expect(contributing).not.toMatch(/\blab\b/i);
  });

  it("documents the platform admin app demo", () => {
    expect(readme).toMatch(/\*\*Platform admin app\.\*\*/);
    for (const email of [
      "ada.bakare@measured-health.example",
      "tunde.okafor@measured-health.example",
      "amara.eze@measured-health.example",
      "new.admin@measured-health.example",
    ])
      expect(readme).toContain(email);
    expect(readme).toContain("npm run dev:platform");
    expect(readme).toMatch(
      /`PLATFORM_SESSION_SECRET`\s+is\s+required\s+in\s+live\s+mode/,
    );
  });

  it("documents the platform analytics demo", () => {
    expect(readme).toMatch(/\*\*Analytics\.\*\*/);
  });

  it("documents the platform clearances demo", () => {
    expect(readme).toMatch(/\*\*Clearances\.\*\*/);
  });

  it("documents the platform audit log demo", () => {
    expect(readme).toMatch(/\*\*Audit log\.\*\*/);
  });

  it("documents the platform system demo", () => {
    expect(readme).toMatch(/\*\*System\s+health\s+and\s+failed\s+jobs\.\*\*/);
  });

  it("documents the platform notifications and the analytics email setting", () => {
    expect(readme).toMatch(/\*\*Notifications\.\*\*/);
    expect(readme).toMatch(/Analytics\s+email/);
    expect(readme).toMatch(/Critical\s+and\s+weekly\s+digest/);
    expect(readme).toMatch(/Auditors\s+get\s+no\s+email/);
  });

  it("documents the legal holds demo", () => {
    expect(readme).toMatch(/\*\*Legal holds\.\*\*/);
    expect(readme).toMatch(
      /lifting\s+a\s+hold\s+needs\s+two\s+platform\s+admins/i,
    );
  });

  it("documents the platform settings demo", () => {
    expect(readme).toMatch(/\*\*Settings\.\*\*/);
  });

  it("says the 403 page has no link, and no longer sets its address", () => {
    expect(readme).not.toMatch(/NEXT_PUBLIC_ADMIN_APP_URL/);
    expect(readme).toMatch(
      /say[s]?\s+to\s+use\s+the\s+platform\s+admin\s+app,\s+with\s+no\s+link/,
    );
  });

  it("documents the patient alerts on Usage and the small-group rule", () => {
    expect(readme).toMatch(/\*\*Patient alerts on Usage\.\*\*/);
    expect(readme).toMatch(/What\s+changed/);
    expect(readme).toMatch(/"Fewer\s+than\s+5"/);
    expect(readme).toMatch(/are\s+in\s+Analysis,\s+below/);
    expect(readme).not.toMatch(/\blab\b/i);
  });

  it("documents the analysis demo", () => {
    expect(readme).toMatch(/\*\*Analysis\.\*\*/);
    expect(readme).toContain("analyst.adeyemi@havanahospital.org");
  });

  it("says Analysis needs sign-off and stays off in live mode", () => {
    const from = readme.indexOf("### Analysis");
    expect(from).toBeGreaterThan(-1);
    const to = readme.indexOf("### Tests", from);
    const section = readme.slice(from, to === -1 ? undefined : to);
    expect(section).toMatch(
      /clinical,\s+privacy\s+and\s+legal\s+sign-off\s+before\s+live\s+use/,
    );
    expect(section).toMatch(/ANALYSIS_SIGNED_OFF=true/);
    const contributing = readFileSync(
      path.join(repositoryRoot, "CONTRIBUTING.md"),
      "utf8",
    );
    expect(contributing).toMatch(
      /Clinical,\s+privacy\s+and\s+legal\s+sign-off\s+is\s+required\s+before\s+live\s+use/,
    );
  });

  it("documents the named access demo", () => {
    expect(readme).toMatch(/\*\*Named access\.\*\*/);
    expect(readme).toMatch(
      /platform\s+admin\s+app's\s+demo,\s+whose\s+store\s+is\s+separate/,
    );
    expect(readme).toContain("`123456`");
  });

  it("says named access stays off until sign-off", () => {
    const from = readme.indexOf("### Analysis");
    const section = readme.slice(from);
    expect(section).toMatch(/NAMED_ACCESS_SIGNED_OFF=true/);
    expect(section).toMatch(/clinical,\s+privacy\s+and\s+legal\s+sign-off/);
    expect(section).toMatch(/two\s+platform\s+admins/);
  });

  it("documents the EMR connections and alert settings demo", () => {
    const section = readme.slice(
      readme.indexOf("### EMR connections and alert settings"),
      readme.indexOf("### Analysis"),
    );
    expect(section).toMatch(/Sample\s+data\s+only/);
    expect(section).toMatch(/\*\*Connections\*\*/);
    expect(section).toMatch(/\*\*Alert\s+settings\*\*/);
    expect(section).toMatch(/`123456`/);
    expect(section).toMatch(/write-only/);
    expect(section).toMatch(/Plan\s+5a\s+clinical\s+and\s+privacy\s+sign-off/);
    expect(section).not.toMatch(/\blab\b/i);
  });

  it("documents Show names in Analysis: who, the purpose, the banner, how it ends and the sign-off", () => {
    const para = readme.slice(
      readme.indexOf("**Analysis.**"),
      readme.indexOf("**Named access.**"),
    );
    expect(para).not.toMatch(/hour/i);
    expect(para).toMatch(/every\s+30\s+seconds/);
    expect(readme).toMatch(/\*\*Show\s+names\*\*/);
    expect(readme).toMatch(/Clinical\s+follow-up,\s+Quality\s+improvement/);
    expect(readme).toMatch(
      /Named\s+view\s+·\s+letter\s+until\s+\{date\}\s+·\s+this\s+view\s+is\s+recorded/,
    );
    expect(readme).toMatch(
      /viewed\s+\{n\}\s+patients\s+by\s+name\s+in\s+Analysis/,
    );
    expect(readme).toMatch(/Named\s+access\s+has\s+ended/);
    expect(readme).toMatch(
      /Named access needs a clearance letter\. Ask your hospital admin\./,
    );
    const from = readme.indexOf("### Analysis");
    expect(readme.slice(from)).toMatch(
      /Names\s+in\s+Analysis\s+\(Show\s+names\)\s+are\s+part\s+of\s+the\s+same\s+sign-off/,
    );
  });
});
