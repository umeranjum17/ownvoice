import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Dot } from './Dot';
import type { Mood } from './dot';
import { space, type, useTheme } from './theme';

/** Nothing to show: Dot says so with the one plain line, and the one thing to do next if there is one. */
export function Empty({ mood, text, children }: { mood: Mood; text: string; children?: ReactNode }) {
  const t = useTheme();
  return <View style={styles.empty}>
    <Dot mood={mood} size={72} />
    <Text style={[type.body, { color: t.text, textAlign: 'center', marginTop: space.m }]}>{text}</Text>
    {children ? <View style={{ marginTop: space.l }}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.s, paddingBottom: space.xl },
});
