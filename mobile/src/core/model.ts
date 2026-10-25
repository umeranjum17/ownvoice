import { store } from './store';
import type { CloudKey } from './source';

/** The one the person picked to write, from the vendor's own list, per account. Ownvoice never picks one:
 *  nothing here means the app asks. `name` is the vendor's own words for it, kept so the row shows without a network. */
export type PickedModel = { id: string; name: string };
const KEY = 'writer-models';

const all = (): Partial<Record<CloudKey, PickedModel>> => store.get<Partial<Record<CloudKey, PickedModel>>>(KEY) ?? {};

export const pickedModel = (key: CloudKey): PickedModel | null => {
  const found = all()[key];
  return found && typeof found.id === 'string' && found.id ? found : null;
};

export function setPickedModel(key: CloudKey, model: PickedModel | null): void {
  const next = { ...all() };
  if (model) next[key] = model; else delete next[key];
  store.set(KEY, next);
}
