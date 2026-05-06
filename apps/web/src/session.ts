const CSRF_TOKEN_STORAGE_KEY = "openvoice.csrfToken";
const DISPLAY_NAME_STORAGE_KEY = "openvoice.displayName";

export function persistSessionState(displayName: string, csrfToken: string): void {
  setSessionStorageItem(CSRF_TOKEN_STORAGE_KEY, csrfToken);
  setSessionStorageItem(DISPLAY_NAME_STORAGE_KEY, displayName);
}

export function clearSessionState(): void {
  removeSessionStorageItem(CSRF_TOKEN_STORAGE_KEY);
  removeSessionStorageItem(DISPLAY_NAME_STORAGE_KEY);
}

export function readSessionCsrfToken(): string | null {
  return readSessionStorageItem(CSRF_TOKEN_STORAGE_KEY);
}

export function readSessionDisplayName(): string | null {
  return readSessionStorageItem(DISPLAY_NAME_STORAGE_KEY);
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readSessionStorageItem(key: string): string | null {
  return getSessionStorage()?.getItem(key) ?? null;
}

function setSessionStorageItem(key: string, value: string): void {
  getSessionStorage()?.setItem(key, value);
}

function removeSessionStorageItem(key: string): void {
  getSessionStorage()?.removeItem(key);
}
