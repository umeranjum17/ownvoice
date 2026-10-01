import { StyleSheet, Text, View } from 'react-native';
import { CheckIcon, WarnIcon } from './icons';
import { space, type, useTheme } from './theme';

/** One row in the Why? reasons card: a tick or a warning in a soft circle, the check's name, and its detail. */
export function ReasonRow({ ok, name, detail }: { ok: boolean | null; name: string; detail?: string }) {
  const t = useTheme();
  return <View style={styles.row}>
    <View style={[styles.badge, { backgroundColor: ok === null ? t.raised : ok ? t.primaryContainer : t.attention + '26' }]}>
      {ok === null ? <Text style={{color:t.muted}}>–</Text> : ok
        ? <CheckIcon size={16} color={t.onPrimaryContainer} />
        : <WarnIcon size={16} color={t.attention} />}
    </View>
    <View style={styles.words}>
      <Text style={[type.body, { color: t.text, fontWeight: ok ? '400' : '500' }]}>{name}</Text>
      {detail ? <Text style={[type.note, { color: t.muted, marginTop: 2 }]}>{detail}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.m, paddingVertical: space.s, alignItems: 'flex-start' },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: -2 },
  words: { flex: 1 },
});
