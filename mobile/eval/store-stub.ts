// In-memory stand-in for mobile/src/core/store.ts (expo-sqlite), so the
// dev-only eval can import the app's live core modules under plain node.
// The eval never reads or writes the phone's settings.
export const store = {
  peek<T>(name: string): T | null { return null; },
  get<T>(name: string, strict = false): T | null { return null; },
  set(name: string, value: unknown): void {},
};
