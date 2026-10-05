import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from './icons';
import { shape, space, type, useTheme } from './theme';

/** One-of-a-few choices as a segmented bar: the picked one lifts out with a tick. Labels never cut off;
 *  on a narrow screen or with large text the choices scroll horizontally instead. */
export function Choices<T extends string>({ options, value, onPick }: { options: readonly T[]; value: T | null; onPick: (option: T) => void }) {
  const t = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.scroll, { backgroundColor: t.group }]} contentContainerStyle={styles.bar}>
    {options.map(option => {
      const on = option === value;
      return <Pressable key={option} accessibilityRole="button" accessibilityLabel={option} accessibilityState={{ selected: on }} onPress={() => onPick(option)}
        android_ripple={{ color: t.primary + '1F', borderless: false }}
        style={[styles.option, on && { backgroundColor: t.primary }]}>
        {on ? <CheckIcon size={16} color={t.onPrimary} /> : null}
        <Text style={[type.label, { color: on ? t.onPrimary : t.text, textAlign: 'center' }]} maxFontSizeMultiplier={1.15}>{option}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { borderRadius: shape.group },
  bar: { flexDirection: 'row', padding: space.xs, gap: space.xs },
  option: { minHeight: 48, borderRadius: shape.round, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.s },
});
