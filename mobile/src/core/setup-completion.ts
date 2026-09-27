import Native from '../../modules/ownvoice-native';
import { store } from './store';

export async function completeSetup(): Promise<void> {
  await Native.clearSetupReturn();
  store.set('setup-done', true);
  try { store.set('setup', null); } catch {}
}
