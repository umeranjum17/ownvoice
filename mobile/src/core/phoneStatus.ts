import { agreedToDownload, localModelState } from './localModel';

export type PhoneCanWrite = 'ready' | 'needsDownload' | 'preparing' | 'cant';

/** Whether the local on-device writer can draft: ready, waiting for download consent, installing, or unavailable. */
export async function phoneCanWrite(): Promise<PhoneCanWrite> {
  try {
    const state = await localModelState();
    if (state === ('ready' as any)) return 'ready';
    if (state === ('not-installed' as any)) return agreedToDownload() ? 'preparing' : 'needsDownload';
    if (state === ('installing' as any) || state === ('installed' as any) || state === ('loading' as any)) return 'preparing';
    return 'cant';
  } catch { return 'cant'; }
}
