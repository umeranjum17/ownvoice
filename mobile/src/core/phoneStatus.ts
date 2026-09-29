import { agreed, modelStatus } from './phoneDownload';

export type PhoneCanWrite = 'ready' | 'needsDownload' | 'preparing' | 'cant';

/** Whether the on-device writer can draft on this phone: available, waiting for the person's yes to the
 *  one-time download, getting ready, or not at all (a failed status call counts as not at all). */
export async function phoneCanWrite(): Promise<PhoneCanWrite> {
  try {
    switch (await modelStatus()) {
      case 'available': return 'ready';
      case 'downloadable': return agreed() ? 'preparing' : 'needsDownload';
      case 'downloading': return 'preparing';
      default: return 'cant';
    }
  } catch { return 'cant'; }
}
