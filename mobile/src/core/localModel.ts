import { LocalModel, model, type InferState } from '@byokit/infer';
import { initLlama } from 'llama.rn';
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

/** Current model state: unsupported, not-installed, installing, installed, loading, ready, busy, failed. */
export async function localModelState(): Promise<InferState> {
  const local = getLocalModel();
  return local.check();
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

/** Generate text using the local model. */
export async function askLocal(prompt: string, maxTokens: number): Promise<string> {
  const local = getLocalModel();
  const result = await local.complete({ prompt, maxOutputTokens: maxTokens });
  return result.text;
}
