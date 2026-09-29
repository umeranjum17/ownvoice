import { NativeModule, requireNativeModule } from 'expo';

export type ServiceState = 'on' | 'off' | 'stuck';
import type { ScreenText } from '../../../src/core/drafts';
export type Capture = { conversation: string; written: string; nodes: ScreenText[]; fieldTop: number | null; typed: string; app: string; label: string; at: number; id: string; hasField: boolean };
export type TapFact = { id: string; at: number; app: string; label: string; screen: boolean; typed: boolean; replying: boolean; sent: boolean };
export type ModelStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';
type Events = {
  onServiceChange: (event: { state: ServiceState }) => void;
  onInserted: (event: { ok: boolean; newlinesLost: boolean; practice: boolean }) => void;
  onModelProgress: (event: { fraction: number }) => void;
  onModelSettled: (event: Record<string, never>) => void;
  onModelPartial: (event: { id: string; text: string }) => void;
};
declare class OwnvoiceNativeModule extends NativeModule<Events> {
  serviceState(): Promise<ServiceState>;
  turnOff(): Promise<void>;
  openAccessibilitySettings(comeBack: boolean): Promise<void>;
  clearSetupReturn(): Promise<void>;
  openAppInfo(): Promise<void>;
  setPractice(on: boolean): Promise<void>;
  launcherApps(packages: string[] | null): Promise<{ app: string; label: string; icon: string | null }[]>;
  bubbleRules(): Promise<{ paused: boolean; on: string[]; off: string[] }>;
  setBubbleRules(rules: { paused: boolean; on: string[]; off: string[] }): Promise<void>;
  say(message: string, ms?: number): Promise<void>;
  capture(): Promise<Capture | null>;
  forget(): Promise<void>;
  takeTapFacts(): Promise<TapFact[]>;
  markTapSent(id: string): Promise<void>;
  unmarkTapSent(id: string): Promise<void>;
  clearTapFacts(): Promise<void>;
  copy(text: string): Promise<void>;
  insert(text: string): Promise<{ ok: boolean; newlinesLost: boolean }>;
  closePanel(): Promise<void>;
  sharedMarkdown(): Promise<string | null>;
  rewriteInput(): { text: string; editable: boolean; markdown?: boolean } | null;
  finishRewrite(text: string | null, replace: boolean): Promise<void>;
  modelStatus(): Promise<ModelStatus>;
  /** The one-time download of the phone's writer: Wi-Fi only unless allowMobileData, resumable. */
  downloadModel(opts: { allowMobileData?: boolean }, onProgress: (fraction: number) => void): Promise<void>;
  cancelModelDownload(): Promise<void>;
  /** Removes the downloaded writer; the status goes back to 'downloadable'. */
  deleteModel(): Promise<void>;
  ask(id: string, prompt: string, options: { maxTokens: number }): Promise<string>;
  draftStream(id: string, prompt: string, maxTokens: number): Promise<string>;
  drafts(prompt: string, options: { candidates: number; maxTokens: number }): Promise<string[]>;
}
const Native: OwnvoiceNativeModule = requireNativeModule<OwnvoiceNativeModule>('OwnvoiceNative');
export default Native;
