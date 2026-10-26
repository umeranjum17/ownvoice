import { routes } from '@byokit/accounts';
import { connectView, type ConnectGroup, type ConnectRow } from '@byokit/ui/connect';
import { cardOfRoute, connectsHere, type CloudKey } from './cards';

/** The kit's connect list for this phone: every route it knows, grouped by how the person pays (plans, then pay per
 *  use, and the rest), each row with the kit's own billing words and status. Nothing is picked, preselected or left
 *  out; a route this phone can't use stays in with the kit's reason. Read when a screen opens, never at load. */
export const connectGroups = (): ConnectGroup[] => connectView(routes({ platform: 'rn' })).groups;

/** The card (the id Ownvoice stores and asks by) a row connects. */
export const cardOfRow = (row: ConnectRow): CloudKey => cardOfRoute(row.id);

/** Whether this app has a screen for the row's way in: a sign-in (page or code) or a pasted key. */
export const usable = (row: ConnectRow): boolean => row.ready && (row.does === 'signin' || row.does === 'key') && connectsHere(cardOfRow(row));

/** The row a stored card was connected through, if the kit still lists it. */
export const rowOfCard = (groups: ConnectGroup[], card: CloudKey | null): ConnectRow | undefined =>
  card ? groups.flatMap(group => group.rows).find(row => cardOfRow(row) === card && usable(row)) : undefined;
