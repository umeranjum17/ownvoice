import { agreedToDownload, localModelState } from './localModel';

export type PhoneCanWrite = 'ready' | 'needsDownload' | 'preparing' | 'cant';

/** Whether the local on-device writer can draft: ready, waiting for download consent, installing, or unavailable. */
export async function phoneCanWrite(): Promise<PhoneCanWrite> {
  try {
    const state = await localModelState();
    switch (state) {
      case 'ready': return 'ready';
      case 'not-installed': return agreedToDownload() ? 'preparing' : 'needsDownload';
      case 'installing':
      case 'installed':
      case 'loading': return 'preparing';
      default: return 'cant';
    }
  } catch { return 'cant'; }
}
