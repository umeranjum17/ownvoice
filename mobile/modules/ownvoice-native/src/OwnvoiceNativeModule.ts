import { NativeModule, requireNativeModule } from 'expo';

export type ServiceState = 'on' | 'off' | 'stuck';
export type Capture = { conversation: string; written: string; typed: string; app: string; label: string; at: number; hasField: boolean };
export type TapFact = { at: number; app: string; label: string; screen: boolean; typed: boolean; replying: boolean };
type Events = {
  onServiceChange: (event: { state: ServiceState }) => void;
  onInserted: (event: { ok: boolean; newlinesLost: boolean }) => void;
};
declare class OwnvoiceNativeModule extends NativeModule<Events> {
  serviceState(): ServiceState;
  openAccessibilitySettings(): void;
  setBubbleRules(rules: { paused: boolean; on: string[]; off: string[]; defaults: string[] }): void;
  setPractice(on: boolean): void;
  say(message: string, ms?: number): void;
  capture(): Capture | null;
  forget(): void;
  takeTapFacts(): TapFact[];
  insert(text: string): Promise<{ ok: boolean; newlinesLost: boolean }>;
  closePanel(): void;
  debugTree(): string;
}
export default requireNativeModule<OwnvoiceNativeModule>('OwnvoiceNative');
