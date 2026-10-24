import Constants from 'expo-constants';

/** The app's own version, read from the build's config (app.config.js), never typed here. */
export const appVersion = (): string | null => Constants.expoConfig?.version ?? null;
/** The Android build number from the same config. */
export const appBuild = (): number | null => Constants.expoConfig?.android?.versionCode ?? null;
/** Only the tagged-release workflow (apk-release.yml) sets this; local and CI test builds don't, so they say they are pre-release. */
export const isRelease = (): boolean => process.env.EXPO_PUBLIC_OWNVOICE_RELEASE === '1';

/** "1.0.9", or "1.0.9-dev" on a build that is not a tagged release; null when the build carries no version. */
export function versionName(version = appVersion(), release = isRelease()): string | null {
  return version ? (release ? version : `${version}-dev`) : null;
}

const core = (version: string) => version.split('.').slice(0, 3).join('.');
const parts = (version: string) => core(version).split('.').map(Number);

export type HelperMatch = 'same' | 'helper-older' | 'helper-newer' | 'unknown';

/** How the computer helper's version compares with the app's. A fourth (build) number is ignored: only a changed release counts. */
export function helperMatch(app: string | null, helper: string | null): HelperMatch {
  if (!app || !helper) return 'unknown';
  if (core(app) === core(helper)) return 'same';
  const [a, h] = [parts(app), parts(helper)];
  for (let i = 0; i < 3; i++) if (a[i] !== h[i]) return h[i] < a[i] ? 'helper-older' : 'helper-newer';
  return 'same';
}
