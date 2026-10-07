export * from 'ownvoice-engine/src/platforms.ts';
import { platformForApp as enginePlatformForApp } from 'ownvoice-engine/src/platforms.ts';
import type { ScreenText } from 'ownvoice-engine/src/drafts.ts';

export function platformForApp(app?: string | null, nodes: ScreenText[] = []) {
  // Expo flags belong to the mobile layer; the shared engine is environment-free.
  if (process.env.EXPO_PUBLIC_DEMO_PLATFORM === '1' && app === 'dev.ownvoice.demo') {
    const text = nodes.map(node => node.text).join('\n');
    app = /p=reddit|Reddit-style/i.test(text) ? 'com.reddit.frontpage' : 'com.twitter.android';
  }
  return enginePlatformForApp(app, nodes);
}
