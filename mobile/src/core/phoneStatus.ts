import { InferError } from '@byokit/infer';
import { agreedToDownload, localModelState } from './localModel';
import { downloading } from './phoneDownload';

export type PhoneCanWrite = 'ready' | 'needsDownload' | 'preparing' | 'cant';

/** Whether the local on-device writer can draft: ready, waiting for download consent, installing, or unavailable. */
export async function phoneCanWrite(): Promise<PhoneCanWrite> {
  try {
    switch ((await localModelState()).phase) {
      case 'ready':
      case 'busy':
      case 'installed': return 'ready';
      case 'not-installed': return agreedToDownload() ? 'preparing' : 'needsDownload';
      case 'installing':
      case 'loading': return 'preparing';
      default: return 'cant';
    }
  } catch (error) {
    if (!(error instanceof InferError && error.code === 'busy')) return 'cant';
    // The busy lock is also held by install and remove: during a download the phone is still preparing.
    return downloading() ? 'preparing' : 'ready';
  }
}
