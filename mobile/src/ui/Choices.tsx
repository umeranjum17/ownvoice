import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from './icons';
import { shape, space, type, useTheme } from './theme';

/** One-of-a-few choices as a segmented bar: the picked one lifts out with a tick. */
export function Choices<T extends string>({ options, value, onPick }: { options: readonly T[]; value: T | null; onPick: (option: T) => void }) {
  const t = useTheme();
  return <View style={[styles.bar, { backgroundColor: t.group }]}>
    {options.map(option => {
      const on = option === value;
      return <Pressable key={option} accessibilityRole="button" accessibilityLabel={option} accessibilityState={{ selected: on }} onPress={() => onPick(option)}
        android_ripple={{ color: t.primary + '1F', borderless: false }}
        style={[styles.option, on && { backgroundColor: t.primary }]}>
        {on ? <CheckIcon size={16} color={t.onPrimary} /> : null}
        <Text numberOfLines={1} style={[type.label, { color: on ? t.onPrimary : t.text }]}>{option}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'nowrap', borderRadius: shape.round, padding: space.xs, gap: space.xs },
  option: { flex: 1, minHeight: 48, borderRadius: shape.round, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: 6, overflow: 'hidden' },
});
