import Native from '../../modules/ownvoice-native';

export type PhoneCanWrite = 'ready' | 'preparing' | 'cant';

/** Whether the on-device writer can draft on this phone: available, still getting ready, or not at all (a failed status call counts as not at all). */
export async function phoneCanWrite(): Promise<PhoneCanWrite> {
  try {
    switch (await Native.modelStatus()) {
      case 'available': return 'ready';
      case 'downloadable':
      case 'downloading': return 'preparing';
      default: return 'cant';
    }
  } catch { return 'cant'; }
}
