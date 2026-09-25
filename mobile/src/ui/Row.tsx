import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { shape, space, type, useTheme } from './theme';
import { ChevIcon } from './icons';

type RowProps = {
  lead?: ReactNode;
  title: string;
  subtitle?: string;
  end?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
};

/** A settings row: optional leading icon, title, subtitle, and a chevron or switch at the end. */
export function Row({ lead, title, subtitle, end, onPress, disabled = false }: RowProps) {
  const t = useTheme();
  const inner = <>
    {lead}
    <View style={styles.words}>
      <Text style={[type.body, { color: t.text }]}>{title}</Text>
      {subtitle && <Text style={[type.note, { color: t.muted }]}>{subtitle}</Text>}
    </View>
    {end ?? (onPress ? <ChevIcon size={24} color={t.muted} /> : null)}
  </>;
  if (!onPress) return <View style={[styles.row, disabled && styles.off]}>{inner}</View>;
  return <Pressable
    disabled={disabled}
    onPress={onPress}
    android_ripple={{ color: t.text + '12', foreground: true }}
    style={({ pressed }) => [styles.row, disabled && styles.off]}>
    {inner}
  </Pressable>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderRadius: shape.group,
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.l,
    overflow: 'hidden',
  },
  words: { flex: 1 },
  off: { opacity: 0.38 },
});
