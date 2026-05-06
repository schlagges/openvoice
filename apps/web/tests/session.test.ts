import { afterEach, describe, expect, it } from "vitest";

import {
  clearSessionState,
  persistSessionState,
  readSessionCsrfToken,
  readSessionDisplayName,
} from "../src/session";

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const localStorageMock = createStorage();
const sessionStorageMock = createStorage();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorageMock,
});

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
  },
});

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
