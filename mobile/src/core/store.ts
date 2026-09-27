import Storage from 'expo-sqlite/kv-store';

// App settings that must survive process death (the equivalent of Kotlin's commit()).
// Read history itself is owned by the native service, not this store.
const snapshots = new Map<string, unknown>();
export const store = {
  peek<T>(name: string): T | null { return (snapshots.get(name) as T | undefined) ?? null; },
  get<T>(name: string, strict = false): T | null {
    try {
      const raw = Storage.getItemSync(name);
      const value = raw == null ? null : (JSON.parse(raw) as T);
      snapshots.set(name, value);
      return value;
    } catch (error) {
      if (strict) throw error;
      return null;
    }
  },
  set(name: string, value: unknown): void {
    if (value == null) Storage.removeItemSync(name);
    else Storage.setItemSync(name, JSON.stringify(value));
    snapshots.set(name, value);
  },
};
