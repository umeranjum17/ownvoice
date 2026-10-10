import { NativeModule, requireNativeModule } from 'expo';

export type ServiceState = 'on' | 'off' | 'stuck';
export type NetworkType = 'wifi' | 'cellular' | 'other' | 'none';
import type { ScreenText } from '../../../src/core/drafts';
export type Capture = { conversation: string; written: string; nodes: ScreenText[]; fieldTop: number | null; typed: string; app: string; label: string; at: number; id: string; hasField: boolean; typingLimited?: boolean };
export type TapFact = { id: string; at: number; app: string; label: string; screen: boolean; typed: boolean; replying: boolean; sent: boolean; inserted?: boolean };
type Events = {
  onServiceChange: (event: { state: ServiceState }) => void;
  onInserted: (event: { ok: boolean; newlinesLost: boolean; practice: boolean }) => void;
  /** A typing pause in a switched-on app, sent only while "Check my spelling as I type" is on. */
  onTyped: (event: { app: string; text: string }) => void;
};
declare class OwnvoiceNativeModule extends NativeModule<Events> {
  serviceState(): Promise<ServiceState>;
  turnOff(): Promise<void>;
  openAccessibilitySettings(comeBack: boolean): Promise<void>;
  clearSetupReturn(): Promise<void>;
  openAppInfo(): Promise<void>;
  /** Opens an ownvoice:// route the way the service's own setup link does; the panel's Linking start lands on Home. */
  openRoute(url: string): Promise<void>;
  setPractice(on: boolean): Promise<void>;
  launcherApps(packages: string[] | null): Promise<{ app: string; label: string; icon: string | null }[]>;
  bubbleRules(): Promise<{ paused: boolean; on: string[]; off: string[] }>;
  setBubbleRules(rules: { paused: boolean; on: string[]; off: string[] }): Promise<void>;
  say(message: string, ms?: number): Promise<void>;
  typingCheck(): Promise<boolean>;
  setTypingCheck(on: boolean): Promise<void>;
  /** The typing check's answer for [app]: the count on the bubble (0 hides it), and what a screen reader says for it. */
  showSlips(app: string, count: number, label: string, checkMs: number): Promise<void>;
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
  /** The active network's transport, so the one-time download stays Wi-Fi-only unless chosen otherwise. */
  networkType(): Promise<NetworkType>;
}
const Native: OwnvoiceNativeModule = requireNativeModule<OwnvoiceNativeModule>('OwnvoiceNative');
export default Native;
