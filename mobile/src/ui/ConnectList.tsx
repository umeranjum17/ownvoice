import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ConnectGroup, ConnectRow } from '@byokit/ui/connect';
import { SourceOption } from './SourceOption';
import { ChatIcon } from './icons';
import { space, type, useTheme } from './theme';
import { cardOfRow, usable } from '../chatgpt/connect';
import type { CloudKey } from '../chatgpt/cards';

/** The kit's list of ways to connect, drawn as it gives it: a heading and note per group (plans, then pay per use,
 *  and the rest), and a radio card per route with the kit's own words for how it is paid and how to sign in. Nothing
 *  is picked until the person taps one. A route this phone can't use stays in the list, dimmed, with the kit's own
 *  reason where its sign-in words would be. `body` draws what the picked card says and offers under its name. */
export function ConnectList({ groups, picked, onPick, body }: {
  groups: ConnectGroup[];
  /** The card connected or being connected; null while nothing is picked. */
  picked: CloudKey | null;
  onPick: (row: ConnectRow) => void;
  body?: (row: ConnectRow) => ReactNode;
}) {
  const t = useTheme();
  return <View style={styles.list}>
    {groups.map(group => <View key={group.id} style={styles.group} accessibilityRole="radiogroup">
      <Text accessibilityRole="header" style={[type.label, styles.title, { color: t.primary }]}>{group.title}</Text>
      <Text style={[type.note, styles.note, { color: t.muted }]}>{group.note}</Text>
      {group.rows.map(row => {
        const ok = usable(row);
        const selected = ok && picked !== null && picked === cardOfRow(row);
        return <SourceOption key={row.key}
          icon={<ChatIcon size={22} color={t.onPrimaryContainer} />}
          title={row.name}
          subtitle={ok ? `${row.billingWords}. ${row.method}.` : `${row.billingWords}. ${row.status}`}
          selected={selected}
          unavailable={!ok}
          onPress={() => onPick(row)}>
          {selected ? body?.(row) : null}
        </SourceOption>;
      })}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: space.l },
  group: { gap: space.s },
  title: { paddingHorizontal: space.s },
  note: { paddingHorizontal: space.s, marginBottom: space.xs },
});
