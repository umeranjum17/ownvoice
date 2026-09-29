import Native, { type ModelStatus } from '../../modules/ownvoice-native';
import { store } from './store';

// The one-time download of the phone's writer on phones without one built in. It starts only after the
// person says yes (kept under AGREED_KEY, with the mobile-data choice under MOBILE_KEY), runs on Wi-Fi
// unless they choose mobile data, picks up where it stopped, and can be removed again in Settings,
// which also forgets the yes and the data choice.

export const AGREED_KEY = 'phone-download-agreed';
export const MOBILE_KEY = 'phone-download-mobile-data';
export const agreed = () => !!store.get<boolean>(AGREED_KEY);

// Emulator acceptance only (EXPO_PUBLIC_E2E_DOWNLOAD=1): a pretend download, so the ask, the bar and
// removing it can be walked on an emulator, which has no phone writer.
const pretend = () => process.env.EXPO_PUBLIC_E2E_DOWNLOAD === '1';
let pretendStatus: ModelStatus = 'downloadable';

let running: Promise<void> | null = null;
let runningMobile = false;
/** Progress (0 to 1) while a download runs, then null once it settles either way. */
const watchers = new Set<(fraction: number | null) => void>();
const tell = (fraction: number | null) => watchers.forEach(watch => watch(fraction));

export function watch(on: (fraction: number | null) => void): () => void {
  watchers.add(on);
  return () => { watchers.delete(on); };
}

export const downloading = () => running !== null;

export async function modelStatus(): Promise<ModelStatus> {
  if (pretend()) return running ? 'downloading' : pretendStatus;
  return Native.modelStatus();
}

/** The person said yes: remember it and get the phone ready. A bare call reuses the stored
 *  mobile-data choice; an explicit choice overwrites it. Joins a running download, except a
 *  mobile-data yes restarts a Wi-Fi-only run with data allowed. */
export function getReady(allowMobileData?: boolean): Promise<void> {
  const mobile = allowMobileData ?? !!store.get<boolean>(MOBILE_KEY);
  if (running) {
    if (mobile && !runningMobile) {
      const prev = running;
      running = null;
      runningMobile = false;
      try { if (!pretend()) Native.cancelModelDownload(); } catch {}
      prev.catch(() => {});
    } else return running;
  }
  store.set(AGREED_KEY, true);
  if (allowMobileData !== undefined) store.set(MOBILE_KEY, allowMobileData ? true : null);
  runningMobile = mobile;
  tell(0);
  const download = pretend() ? pretendDownload() : Native.downloadModel({ allowMobileData: mobile }, tell);
  const current: Promise<void> = download.finally(() => {
    if (running === current) { running = null; runningMobile = false; tell(null); }
  });
  running = current;
  return current;
}

/** Waits without recording a yes: joins a JS-tracked run, else polls native provisioning
 *  until it leaves 'downloading' (the bubble tapping mid-provisioning). */
export async function settle(): Promise<void> {
  if (running) return running;
  for (let i = 0; i < 120; i++) {
    try { if (await modelStatus() !== 'downloading') return; } catch { return; }
    await new Promise(done => setTimeout(done, 1000));
  }
}

/** Picks an agreed download back up where it stopped (the app was closed, or Wi-Fi came back). */
export async function resume(): Promise<void> {
  if (!agreed() || running) return;
  try { if (await modelStatus() === 'downloadable') await getReady(!!store.get<boolean>(MOBILE_KEY)); } catch {}
}

/** Removes the downloaded writer and forgets the yes and the mobile-data choice, so the phone asks again before any new download. */
export async function removeDownload(): Promise<void> {
  if (pretend()) { pretendStatus = 'downloadable'; store.set(AGREED_KEY, null); store.set(MOBILE_KEY, null); return; }
  try { Native.cancelModelDownload(); } catch {}
  await Native.deleteModel();
  store.set(AGREED_KEY, null);
  store.set(MOBILE_KEY, null);
}

function pretendDownload(): Promise<void> {
  return new Promise(done => {
    let fraction = 0;
    const id = setInterval(() => {
      fraction = Math.min(fraction + 0.04, 1);
      tell(fraction);
      if (fraction < 1) return;
      clearInterval(id);
      pretendStatus = 'available';
      done();
    }, 300);
  });
}
