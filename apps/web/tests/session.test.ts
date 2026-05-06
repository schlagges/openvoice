import { afterEach, describe, expect, it } from "vitest";

import {
  clearSessionState,
  persistSessionState,
  readSessionCsrfToken,
  readSessionDisplayName,
} from "../src/session";

describe("web session storage", () => {
  afterEach(() => {
    clearSessionState();
    localStorage.clear();
  });

  it("stores session identity in browser session storage", () => {
    persistSessionState("Alice", "csrf-token-123");

    expect(sessionStorage.getItem("openvoice.csrfToken")).toBe("csrf-token-123");
    expect(sessionStorage.getItem("openvoice.displayName")).toBe("Alice");
    expect(readSessionCsrfToken()).toBe("csrf-token-123");
    expect(readSessionDisplayName()).toBe("Alice");
  });

  it("clears session identity from browser session storage", () => {
    persistSessionState("Alice", "csrf-token-123");
    clearSessionState();

    expect(readSessionCsrfToken()).toBeNull();
    expect(readSessionDisplayName()).toBeNull();
    expect(sessionStorage.getItem("openvoice.csrfToken")).toBeNull();
    expect(sessionStorage.getItem("openvoice.displayName")).toBeNull();
  });

  it("reads only session storage for CSRF token and display name", () => {
    localStorage.setItem("openvoice.csrfToken", "legacy-csrf-token");
    localStorage.setItem("openvoice.displayName", "Legacy User");

    expect(readSessionCsrfToken()).toBeNull();
    expect(readSessionDisplayName()).toBeNull();
  });
});
