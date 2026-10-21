// Host to platform through the engine's Chrome URL-bar path, so the phone and the panel agree on what is X.
import { CHROME_URL_BAR, platformForApp } from '../../packages/engine/src/platforms.ts';

export function platformFor(url: string) {
  return platformForApp('com.android.chrome', [{ text: url, viewId: CHROME_URL_BAR, left: 0, top: 0, bottom: 0, clickable: false }]);
}
