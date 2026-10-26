// The one place that decides whether the app may use an address that is not encrypted. Android allows plain
// traffic app-wide (the computer link dials ws://, which can't be scoped to a LAN address), so the app refuses
// every http:// or ws:// address itself: only the paired computer link, and in a proof build the host stand-ins
// named by its own build flags, may use one.
const standIns = () => [process.env.EXPO_PUBLIC_E2E_AUTH_BASE, process.env.EXPO_PUBLIC_E2E_OPENROUTER_BASE, process.env.EXPO_PUBLIC_E2E_ROUTE_BASE, process.env.EXPO_PUBLIC_E2E_JEV_BASE].filter((base): base is string => !!base);

/** Throws for a plain address, unless it is the computer link's ws:// (`computer`) or a stand-in this build was flagged with. */
export function checkAddress(address: string, o: { computer?: boolean } = {}): void {
  const scheme = /^\s*(https?|wss?):/i.exec(address)?.[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'ws') return;
  if (o.computer && scheme === 'ws') return;
  const origin = (value: string) => new URL(value).origin;
  if (scheme === 'http' && standIns().some((base) => origin(base) === origin(address))) return;
  throw new Error('Blocked an address that is not encrypted.');
}
