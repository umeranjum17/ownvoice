import { PermissionsAndroid, Platform } from 'react-native';
import { DictateError, Dictation, systemEngine, type DictateErrorCode, type DictateSystemNative, type DictateSegment, type DictationHandle } from '@byokit/dictation';
import Native from '../../modules/ownvoice-native';
import { words } from '../core/words';

type Session = { on: (segment: DictateSegment) => void; done?: () => void; fail?: (error: Error) => void; error?: Error };

const sessions = new Map<string, Session>();
let nextId = 0;
let subscribed = false;

type NativeEvent = { id: string; type: string; segment?: DictateSegment; code?: string };

function onNativeEvent(event: NativeEvent) {
  const session = sessions.get(event.id);
  if (!session) return;
  if (event.type === 'segment' && event.segment) session.on(event.segment);
  else if (event.type === 'error') {
    session.error = new DictateError((event.code as DictateErrorCode | undefined) ?? 'unsupported');
    session.fail?.(session.error);
  } else {
    session.done?.();
    sessions.delete(event.id);
  }
}

/** App-owned native binding for the kit's systemEngine (shape from BYOKit examples/dictation-android). */
const port: DictateSystemNative = {
  available: locale => Native.dictateAvailable(locale),
  start: (options, on) => {
    if (!subscribed) { Native.addListener('onDictate', onNativeEvent); subscribed = true; }
    const id = String(++nextId);
    const session: Session = { on };
    sessions.set(id, session);
    // Immediate failures arrive as error events; the throw here only guards a dead bridge.
    void Native.dictateStart(id, { locale: options.locale, partial: options.partial, punctuation: options.punctuation })
      .catch(() => onNativeEvent({ id, type: 'error', code: 'unsupported' }));
    return {
      stop: () => new Promise<void>((resolve, reject) => {
        if (!sessions.has(id)) { resolve(); return; }
        session.done = resolve;
        session.fail = reject;
        if (session.error) { sessions.delete(id); reject(session.error); return; }
        void Native.dictateStop(id).catch(reject);
      }),
      cancel: () => { sessions.delete(id); void Native.dictateCancel(id).catch(() => {}); },
    };
  },
};

/** RECORD_AUDIO, asked at first tap only. */
export async function ensureMic(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** A kit failure code in plain words; null when the recognizer is ready. */
export async function dictateReady(): Promise<string | null> {
  const ready = await new Dictation({ engine: systemEngine(port) }).available({ onDeviceOnly: true });
  if (ready.ok) return null;
  if (ready.code === 'mic-blocked') return words.dictateMic;
  if (ready.code === 'needs-download') return words.dictateLanguage;
  return words.dictateUnavailable;
}

/** Tap-to-listen through the published kit: Android's on-device recognizer, enforced by the native port. */
export function listenForDictation(onPartial?: (text: string) => void): DictationHandle {
  const handle = new Dictation({ engine: systemEngine(port) }).listen({ onDeviceOnly: true });
  if (onPartial) handle.on('partial', ({ segment }) => onPartial(segment.text));
  return handle;
}

/** Debug-only: hand the next session a recorded WAV instead of the mic. Release builds refuse. */
export async function armProofWav(path: string): Promise<boolean> {
  if (!__DEV__) return false;
  try { return await Native.dictateProofWav(path); } catch { return false; }
}

/** A kit failure in plain words; null when there is nothing to say (the person cancelled). */
export function messageForDictationError(error: unknown): string | null {
  const code = error instanceof DictateError ? error.code : 'unsupported';
  if (code === 'cancelled') return null;
  if (code === 'mic-blocked') return words.dictateMic;
  if (code === 'needs-download') return words.dictateLanguage;
  return words.dictateUnavailable;
}
