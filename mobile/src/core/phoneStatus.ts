import { InferError } from '@byokit/infer';
import { agreedToDownload, localModelState } from './localModel';
import { downloading, removing } from './phoneDownload';

export type PhoneCanWrite = 'ready' | 'needsDownload' | 'preparing' | 'cant';

/** Whether the local on-device writer can draft: ready, waiting for download consent, installing, or unavailable. */
export async function phoneCanWrite(): Promise<PhoneCanWrite> {
  // The e2e build writes fixed drafts on the phone (see phoneWriter), so there is no model to wait for.
  if (process.env.EXPO_PUBLIC_E2E_STUB === '1') return 'ready';
  let phase: string;
  try {
    phase = (await localModelState()).phase;
  } catch (error) {
    if (!(error instanceof InferError && error.code === 'busy')) return 'cant';
    phase = 'busy';
  }
  switch (phase) {
    case 'busy': return removing() ? 'cant' : downloading() ? 'preparing' : 'ready';
    case 'ready':
    case 'installed': return 'ready';
    case 'not-installed': return agreedToDownload() ? 'preparing' : 'needsDownload';
    case 'installing':
    case 'loading': return 'preparing';
    default: return 'cant';
  }
}
