import { StyleSheet, Text, View } from 'react-native';
import type { Check } from '../core/judge';
import { CheckIcon, WarnIcon } from './icons';
import { space, type, useTheme } from './theme';

/** One row in the Why? reasons card: a tick or a warning, the check's name, and its detail. */
export function ReasonRow({ ok, name, detail }: { ok: boolean; name: string; detail?: string }) {
  const t = useTheme();
  return <View style={styles.row}>
    {ok
      ? <CheckIcon size={20} color={t.primary} />
      : <WarnIcon size={20} color={t.attention} />}
    <View style={styles.words}>
      <Text style={[type.note, { color: t.text, fontWeight: ok ? '400' : '500' }]}>{name}</Text>
      {detail ? <Text style={[type.note, { color: t.muted }]}>{detail}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.m, paddingVertical: space.s, alignItems: 'flex-start' },
  words: { flex: 1 },
});
