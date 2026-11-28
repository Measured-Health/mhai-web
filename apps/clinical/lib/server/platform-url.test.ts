import { describe, expect, it } from "vitest";
import { platformSignInUrl } from "./platform-url";

describe("platformSignInUrl", () => {
  it("is the platform app's sign-in page", () => {
    expect(
      platformSignInUrl({ PLATFORM_APP_URL: "https://platforms.example.org" }),
    ).toBe("https://platforms.example.org/sign-in");
    expect(
      platformSignInUrl({ PLATFORM_APP_URL: "https://platforms.example.org/" }),
    ).toBe("https://platforms.example.org/sign-in");
  });
  it("is null when unset or not a plain https address", () => {
    for (const v of [
      undefined,
      "",
      "not a url",
      "http://platforms.example.org",
      "javascript:alert(1)",
      "https://user:pw@platforms.example.org",
      "https://platforms.example.org/?next=x",
      "https://platforms.example.org/#x",
      "https://platforms.example.org/other",
    ])
      expect(platformSignInUrl({ PLATFORM_APP_URL: v })).toBeNull();
  });
  it("allows http in development only", () => {
    expect(
      platformSignInUrl({
        PLATFORM_APP_URL: "http://localhost:3001",
        MHAI_DEPLOY_ENV: "development",
      }),
    ).toBe("http://localhost:3001/sign-in");
  });
});
