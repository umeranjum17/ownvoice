import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Dot } from './Dot';
import type { Mood } from './dot';
import { space, type, useTheme } from './theme';

/** Nothing to show: one plain line, and the one thing to do next if there is one. Dot shows only when a mood is passed; the declined panel omits it here because the sheet header already keeps Dot. */
export function Empty({ mood, text, children }: { mood?: Mood; text: string; children?: ReactNode }) {
  const t = useTheme();
  return <View style={styles.empty}>
    {mood ? <Dot mood={mood} size={72} /> : null}
    <Text style={[type.body, { color: t.text, textAlign: 'center', marginTop: space.m }]}>{text}</Text>
    {children ? <View style={{ marginTop: space.l }}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.s, paddingBottom: space.xl },
});
