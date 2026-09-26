import Storage from 'expo-sqlite/kv-store';

// App settings that must survive process death (the plan's kv-store; the equivalent of
// Kotlin's commit()): setup state today, voice, choices and the read log in later slices.
export const store = {
  get<T>(name: string): T | null {
    try {
      const raw = Storage.getItemSync(name);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  set(name: string, value: unknown): void {
    if (value == null) Storage.removeItemSync(name);
    else Storage.setItemSync(name, JSON.stringify(value));
  },
};
