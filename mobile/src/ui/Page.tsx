import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon } from './icons';
import { space, type, useTheme } from './theme';
import { words } from '../core/words';

/** A settings screen: a back arrow at the top, the screen's bold title and its plain note, then the rest.
 *  A footer stays pinned under the scroll, for a screen's one main action. */
export function Page({ title, note, onBack, footer, children }: { title: string; note?: string; onBack: () => void; footer?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const page = <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={[styles.page, { paddingTop: top + space.s }]} keyboardShouldPersistTaps="always">
    <Pressable accessibilityRole="button" accessibilityLabel={words.back} onPress={onBack} hitSlop={4}
      android_ripple={{ color: t.text + '1F', borderless: true, radius: 24 }} style={styles.back}>
      <BackIcon size={24} color={t.text} />
    </Pressable>
    <Text accessibilityRole="header" style={[type.display, { color: t.text }]}>{title}</Text>
    {note ? <Text style={[type.body, { color: t.muted, marginTop: space.s }]}>{note}</Text> : null}
    <View style={styles.body}>{children}</View>
  </ScrollView>;
  if (!footer) return page;
  return <View style={{ flex: 1, backgroundColor: t.sheet }}>
    {page}
    <View style={[styles.footer, { paddingBottom: bottom + space.l, borderTopColor: t.line }]}>{footer}</View>
  </View>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  back: { width: 48, height: 48, marginLeft: -space.m, marginBottom: space.s, alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: space.xl, gap: space.m },
  footer: { paddingHorizontal: space.xl, paddingTop: space.m, gap: space.s, borderTopWidth: StyleSheet.hairlineWidth },
});
