import { PermissionsAndroid, Platform } from 'react-native';
import { DictateError, Dictation, systemEngine, type DictateErrorCode, type DictateSystemNative, type DictateSegment, type DictationHandle } from '@byokit/dictation';
import Native from '../../modules/ownvoice-native';

/** Device-side breadcrumbs for the silent phone proof (logcat); the panel itself stays plain. */
const trace = (line: string) => { try { Native.logDev?.(`dictate ${line}`); } catch (error) { console.warn('dictate trace dropped', error); } };
import { words } from '../core/words';

type Session = { on: (segment: DictateSegment) => void; done?: () => void; fail?: (error: Error) => void; live?: (error: DictateError) => void };

const sessions = new Map<string, Session>();
let nextId = 0;
let subscribed = false;

type NativeEvent = { id: string; type: string; segment?: DictateSegment; code?: string };

function onNativeEvent(event: NativeEvent) {
  const session = sessions.get(event.id);
  if (!session) return;
  if (event.type === 'segment' && event.segment) session.on(event.segment);
  else if (event.type === 'error') {
    sessions.delete(event.id);
    const error = new DictateError((event.code as DictateErrorCode | undefined) ?? 'unsupported');
    // A Stop that is waiting fails with the error; otherwise the panel hears it now, not at Stop.
    if (session.fail) session.fail(error);
    else session.live?.(error);
  } else {
    session.done?.();
    sessions.delete(event.id);
  }
}

/** App-owned native binding for the kit's systemEngine (shape from BYOKit examples/dictation-android). */
const portFor = (live?: (error: DictateError) => void): DictateSystemNative => ({
  available: locale => Native.dictateAvailable(locale),
  start: (options, on) => {
    if (!subscribed) { Native.addListener('onDictate', onNativeEvent); subscribed = true; }
    const id = String(++nextId);
    const session: Session = { on, live };
    sessions.set(id, session);
    // Immediate failures arrive as error events; the throw here only guards a dead bridge.
    void Native.dictateStart(id, { locale: options.locale, partial: options.partial, punctuation: options.punctuation })
      .catch(() => onNativeEvent({ id, type: 'error', code: 'unsupported' }));
    return {
      stop: () => new Promise<void>((resolve, reject) => {
        if (!sessions.has(id)) { resolve(); return; }
        session.done = resolve;
        session.fail = reject;
        void Native.dictateStop(id).catch(reject);
      }),
      cancel: () => { sessions.delete(id); void Native.dictateCancel(id).catch(() => {}); },
    };
  },
});

/** Waits for [settled], but no longer than [ms]: a recognizer that never reports its last words must not hold the mic. */
export function settledWithin(settled: Promise<void>, ms = 8000): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    void settled.then(() => { clearTimeout(timer); resolve(); });
  });
}

/** RECORD_AUDIO, asked at first tap only. */
export async function ensureMic(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** A kit failure code in plain words; null when the recognizer is ready. */
export async function dictateReady(): Promise<string | null> {
  const locale = Native.dictateLocale();
  const ready = await new Dictation({ engine: systemEngine(portFor()) }).available({ onDeviceOnly: true, locale });
  trace(ready.ok ? 'available ok' : `available ${ready.code}`);
  if (!ready.ok) {
    if (ready.code === 'mic-blocked') return words.dictateMic;
    if (ready.code === 'needs-download') return words.dictateLanguage;
    return words.dictateUnavailable;
  }
  const support = await Native.dictateSupport(locale).catch((): 'unknown' => 'unknown');
  trace(`support ${support}`);
  if (support === 'ready') return null;
  if (support === 'needs-download') return words.dictateLanguage;
  return words.dictateUnavailable;
}

/** Start the missing pack and wait until it arrives; false when the prompt is declined, the
 *  download fails, or the pack never lands. The panel comes back as soon as the prompt is answered. */
export async function ensurePack(pollMs = 5000, timeoutMs = 8 * 60 * 1000): Promise<boolean> {
  const locale = Native.dictateLocale();
  try {
    trace('pack download starting');
    await Native.dictatePanelVisible(false);
    const outcome = await Native.dictateDownload(locale);
    await Native.dictatePanelVisible(true);
    if (outcome !== 'scheduled' && outcome !== 'success') { trace(`pack download ${outcome}`); return false; }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      const support = await Native.dictateSupport(locale).catch((): 'unknown' => 'unknown');
      if (support === 'ready') { trace('pack arrived'); return true; }
      if (Date.now() > deadline) { trace('pack wait timed out'); return false; }
    }
  } catch { return false; }
  finally { await Native.dictatePanelVisible(true).catch(() => {}); }
}

/** Proof-only path, set for the silent phone run: the next tap feeds this on-device WAV
 *  through EXTRA_AUDIO_SOURCE instead of the mic. Unset in every other build, and the native
 *  side refuses it outside debug builds, so release behaviour never sees it. */
const proofWav = process.env.EXPO_PUBLIC_E2E_DICTATION_WAV;

export const proofWavPath = (): string | undefined => proofWav || undefined;

/** Tap-to-listen through the published kit: Android's on-device recognizer, enforced by the native port.
 *  `onError` hears a native failure that lands while the person is still talking. */
export function listenForDictation(onPartial?: (text: string) => void, onError?: (error: DictateError) => void): DictationHandle {
  const handle = new Dictation({ engine: systemEngine(portFor(onError)) }).listen({ onDeviceOnly: true, languages: [Native.dictateLocale()] });
  if (onPartial) handle.on('partial', ({ segment }) => onPartial(segment.text));
  return handle;
}

/** Debug-only: hand the next session a recorded WAV instead of the mic. Release builds refuse. */
export async function armProofWav(path: string): Promise<boolean> {
  if (!__DEV__) { trace('proof refused: release'); return false; }
  try {
    const armed = await Native.dictateProofWav(path);
    trace(`proof ${armed ? 'armed' : 'refused'} ${path}`);
    return armed;
  } catch { trace(`proof threw ${path}`); return false; }
}

/** A kit failure in plain words; null when there is nothing to say (the person cancelled). */
export function messageForDictationError(error: unknown): string | null {
  const code = error instanceof DictateError ? error.code : 'unsupported';
  trace(`finish ${code}`);
  if (code === 'cancelled') return null;
  if (code === 'mic-blocked') return words.dictateMic;
  if (code === 'needs-download') return words.dictateLanguage;
  return words.dictateUnavailable;
}
