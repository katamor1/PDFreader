import { describe, expect, it } from "vitest";

import { isAllowedBrowserOrigin } from "../server/originPolicy";

describe("origin policy", () => {
  it("allows requests without a browser origin", () => {
    expect(isAllowedBrowserOrigin(undefined)).toBe(true);
  });

  it("allows local browser origins", () => {
    expect(isAllowedBrowserOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedBrowserOrigin("http://127.0.0.1:5174")).toBe(true);
    expect(isAllowedBrowserOrigin("http://[::1]:5174")).toBe(true);
  });

  it("rejects remote and opaque browser origins", () => {
    expect(isAllowedBrowserOrigin("https://example.com")).toBe(false);
    expect(isAllowedBrowserOrigin("null")).toBe(false);
    expect(isAllowedBrowserOrigin("not a url")).toBe(false);
  });
});
