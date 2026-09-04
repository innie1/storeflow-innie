import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/**
 * Guarantee a working Storage in tests.
 *
 * This environment hands us an empty object for `localStorage` /
 * `sessionStorage` instead of a real Storage, so anything touching them throws
 * "localStorage.clear is not a function" -- including the Supabase auth client,
 * which captures `localStorage` at import time and then fails on every refresh
 * tick. Individual test files used to paper over this with their own partial
 * mocks installed via a non-configurable `Object.defineProperty(global, ...)`,
 * which made behaviour depend on which file loaded first.
 *
 * Installing one spec-compliant implementation here keeps every test file
 * deterministic. If the environment ever does supply a real Storage, we detect
 * that and leave it alone.
 */
function createMemoryStorage(): Storage {
  let data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data = new Map();
    },
    getItem(key: string) {
      const value = data.get(String(key));
      return value === undefined ? null : value;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(String(key));
    },
    setItem(key: string, value: string) {
      data.set(String(key), String(value));
    },
  } as Storage;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const existing = (globalThis as Record<string, any>)[name];
  if (existing && typeof existing.getItem === "function") continue;

  const storage = createMemoryStorage();
  const descriptor = { value: storage, writable: true, configurable: true };
  Object.defineProperty(globalThis, name, descriptor);
  if (typeof window !== "undefined") Object.defineProperty(window, name, descriptor);
}
