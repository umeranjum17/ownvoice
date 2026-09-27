import Storage from 'expo-sqlite/kv-store';

// App settings that must survive process death (the equivalent of Kotlin's commit()).
// Read history itself is owned by the native service, not this store.
export const store = {
  get<T>(name: string, strict = false): T | null {
    try {
      const raw = Storage.getItemSync(name);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      if (strict) throw error;
      return null;
    }
  },
  set(name: string, value: unknown): void {
    if (value == null) Storage.removeItemSync(name);
    else Storage.setItemSync(name, JSON.stringify(value));
  },
};
