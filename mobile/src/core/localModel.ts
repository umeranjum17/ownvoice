import { LocalModel, model, type InferState } from '@byokit/infer';
import { initLlama, installJsi } from 'llama.rn';
import Native from '../../modules/ownvoice-native';
import { createLocalStore } from './localStore';
import { store } from './store';
import { words } from './words';

/**
 * Singleton local model manager for @byokit/infer.
 * Replaces the Native module's model management (PhoneModel.kt, AiCore.kt, LocalGemma.kt).
 */

let instance: LocalModel | null = null;
const modelStore = createLocalStore();

export const AGREED_KEY = 'local-model-agreed';
export const MOBILE_KEY = 'local-model-mobile-data';

/** Get or create the shared local model instance. */
export function getLocalModel(): LocalModel {
  if (!instance) {
    instance = new LocalModel({
      model: model(),
      store: modelStore,
      initLlama: initLlama as any,
      device: { platform: 'android' },
    });
  }
  return instance;
}

// One native context takes one call at a time; a second overlapping call would reject busy.
let onDevice: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(run: () => Promise<T>): Promise<T> {
  const result = onDevice.then(run);
  onDevice = result.catch(() => {});
  return result;
}

/** Current model state: unsupported, not-installed, installing, installed, loading, ready, busy, failed. */
export function localModelState(): Promise<InferState> {
  return oneAtATime(async () => {
    const local = getLocalModel();
    // A model file can sit on the phone while llama.rn's JNI library is missing from the APK; then nothing can start.
    try { await installJsi(); } catch (error) {
      console.warn(`Ownvoice native library did not load: ${error instanceof Error ? error.message : String(error)}`);
      return { phase: 'unsupported' } as InferState;
    }
    return local.check();
  });
}

/** Install the local model with progress tracking. Wi-Fi-only unless mobile data was chosen. */
export async function installLocalModel(
  allowMobileData: boolean,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!allowMobileData && await Native.networkType().catch(() => 'other' as const) === 'cellular') {
    throw new Error(words.readyStopped);
  }
  const local = getLocalModel();
  await local.install({
    signal,
    onProgress: (got, total) => {
      onProgress(total > 0 ? got / total : 0);
    },
  });
  store.set(AGREED_KEY, true);
  store.set(MOBILE_KEY, allowMobileData ? true : null);
}

/** Remove the local model and forget consent. */
export async function removeLocalModel(): Promise<void> {
  const local = getLocalModel();
  await local.remove();
  store.set(AGREED_KEY, null);
  store.set(MOBILE_KEY, null);
  instance = null;
}

/** Whether the person agreed to download the model. */
export function agreedToDownload(): boolean {
  return !!store.get<boolean>(AGREED_KEY);
}

/** Generate text using the local model; calls and state checks queue behind each other.
 *  With [jsonSchema], decoding is constrained to that JSON shape. */
export function askLocal(prompt: string, maxTokens: number, signal?: AbortSignal, jsonSchema?: object): Promise<string> {
  return oneAtATime(async () => {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    return (await getLocalModel().complete({ prompt, maxOutputTokens: maxTokens, signal, jsonSchema })).text;
  });
}
