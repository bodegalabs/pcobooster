import { Schema } from "effect";

const preferencesSchema = Schema.Struct({
  appearance: Schema.Literals(["System", "Light", "Dark"]),
  analytics: Schema.Boolean,
});
export type NativePreferences = typeof preferencesSchema.Type;
export interface PreferencesStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}
const preferenceKey = "pcobooster.preferences.v1";
export class PreferencesStore {
  private snapshot: NativePreferences = {
    appearance: "System",
    analytics: false,
  };
  private readonly listeners = new Set<() => void>();
  private readonly storage: PreferencesStorage;
  constructor(storage: PreferencesStorage) {
    this.storage = storage;
  }
  getSnapshot = (): NativePreferences => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private readonly publish = (snapshot: NativePreferences): void => {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener();
    }
  };
  restore = async (): Promise<void> => {
    const value = await this.storage.getItem(preferenceKey);
    if (value !== null) {
      this.publish(
        Schema.decodeUnknownSync(preferencesSchema)(JSON.parse(value))
      );
    }
  };
  update = async (snapshot: NativePreferences): Promise<void> => {
    await this.storage.setItem(preferenceKey, JSON.stringify(snapshot));
    this.publish(snapshot);
  };
}
