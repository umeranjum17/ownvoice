import { NativeModule, requireNativeModule } from 'expo';

export type ServiceState = 'on' | 'off' | 'stuck';
export type Capture = { conversation: string; written: string; typed: string; app: string; label: string; at: number; hasField: boolean };
export type TapFact = { at: number; app: string; label: string; screen: boolean; typed: boolean; replying: boolean };
export type ModelStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';
type Events = {
  onServiceChange: (event: { state: ServiceState }) => void;
  onInserted: (event: { ok: boolean; newlinesLost: boolean }) => void;
  onModelProgress: (event: { fraction: number }) => void;
  onModelPartial: (event: { id: string; text: string }) => void;
};
declare class OwnvoiceNativeModule extends NativeModule<Events> {
  serviceState(): Promise<ServiceState>;
  openAccessibilitySettings(): Promise<void>;
  launcherApps(): Promise<{ app: string; label: string }[]>;
  bubbleRules(): Promise<{ paused: boolean; on: string[]; off: string[] }>;
  setBubbleRules(rules: { paused: boolean; on: string[]; off: string[] }): Promise<void>;
  practice(): Promise<boolean>;
  setPractice(enabled: boolean): Promise<void>;
  say(message: string, ms?: number): Promise<void>;
  capture(): Promise<Capture | null>;
  forget(): Promise<void>;
  takeTapFacts(): Promise<TapFact[]>;
  copy(text: string): Promise<void>;
  insert(text: string): Promise<{ ok: boolean; newlinesLost: boolean }>;
  closePanel(): Promise<void>;
  modelStatus(): Promise<ModelStatus>;
  downloadModel(): Promise<void>;
  ask(id: string, prompt: string, options: { maxTokens: number; temperature?: number; topK?: number; stream?: boolean }): Promise<string>;
  drafts(prompt: string, options: { candidates: number; maxTokens: number; temperature: number; topK: number }): Promise<string[]>;
}
export default requireNativeModule<OwnvoiceNativeModule>('OwnvoiceNative');
