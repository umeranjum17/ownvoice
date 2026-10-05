import { localModelState, installLocalModel, removeLocalModel, agreedToDownload, AGREED_KEY, MOBILE_KEY } from './localModel';
import { store } from './store';
import type { InferState } from '@byokit/infer';

// The one-time download of the local on-device model. Starts only after the person says yes
// (kept under AGREED_KEY, with mobile-data choice under MOBILE_KEY). Replaced Native module
// download with @byokit/infer's LocalModel.install().

export { AGREED_KEY, MOBILE_KEY };
export const agreed = agreedToDownload;

// Emulator acceptance only (EXPO_PUBLIC_E2E_DOWNLOAD=1): pretend flow for walking the UI.
const pretend = () => process.env.EXPO_PUBLIC_E2E_DOWNLOAD === '1';
let pretendState: InferState = 'not-installed' as InferState;

let running: Promise<void> | null = null;
let runningMobile = false;
let abortController: AbortController | null = null;
/** Progress (0 to 1) while a download runs, then null once it settles. */
const watchers = new Set<(fraction: number | null) => void>();
const tell = (fraction: number | null) => watchers.forEach(watch => watch(fraction));

export function watch(on: (fraction: number | null) => void): () => void {
  watchers.add(on);
  return () => { watchers.delete(on); };
}

export const downloading = () => running !== null;

export async function modelStatus(): Promise<InferState> {
  if (pretend()) return running ? ('installing' as InferState) : pretendState;
  return localModelState();
}

/** The person said yes: remember it and install the model. Joins a running install, or restarts if mobile data choice changed. */
export async function getReady(allowMobileData?: boolean): Promise<void> {
  const mobile = allowMobileData ?? !!store.get<boolean>(MOBILE_KEY);
  if (running) {
    if (mobile && !runningMobile) {
      abortController?.abort();
      running = null;
      runningMobile = false;
    } else return running;
  }
  store.set(AGREED_KEY, true);
  if (allowMobileData !== undefined) store.set(MOBILE_KEY, allowMobileData ? true : null);
  runningMobile = mobile;
  tell(0);

  abortController = new AbortController();
  const download = pretend()
    ? pretendDownload()
    : installLocalModel(mobile, tell, abortController.signal);

  const current: Promise<void> = download.finally(() => {
    if (running === current) { running = null; runningMobile = false; abortController = null; tell(null); }
  });
  running = current;
  return current;
}

/** Waits without recording consent: joins a tracked install, else polls until state leaves 'installing'. */
export async function settle(): Promise<void> {
  if (running) return running;
  for (let i = 0; i < 120; i++) {
    try { if (await modelStatus() !== ('installing' as InferState)) return; } catch { return; }
    await new Promise(done => setTimeout(done, 1000));
  }
}

/** Resumes an agreed install that stopped (app closed, network returned). */
export async function resume(): Promise<void> {
  if (!agreed() || running) return;
  try { if (await modelStatus() === ('not-installed' as InferState)) await getReady(!!store.get<boolean>(MOBILE_KEY)); } catch {}
}

/** Removes the model and forgets consent and data choice. */
export async function removeDownload(): Promise<void> {
  if (pretend()) { pretendState = 'not-installed' as InferState; store.set(AGREED_KEY, null); store.set(MOBILE_KEY, null); return; }
  abortController?.abort();
  await removeLocalModel();
}

function pretendDownload(): Promise<void> {
  return new Promise(done => {
    let fraction = 0;
    const id = setInterval(() => {
      fraction = Math.min(fraction + 0.04, 1);
      tell(fraction);
      if (fraction < 1) return;
      clearInterval(id);
      pretendState = 'ready' as InferState;
      done();
    }, 300);
  });
}
