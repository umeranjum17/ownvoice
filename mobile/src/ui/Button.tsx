import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { shape, type, useTheme } from './theme';
import { useCardBusy } from './Card';

type ButtonProps = {
  kind: 'filled' | 'tonal' | 'outlined' | 'text';
  label: string;
  disabled?: boolean;
  /** A screen's one main action (setup): taller, with a larger label. */
  large?: boolean;
  onPress: () => void;
};

/** A Material pill button. Filled is the one main action on a card; tonal for a small in-line action (a slip's Fix); outlined for a tappable answer (a growth check-in); text for the rest. */
export function Button({ kind, label, disabled = false, large = false, onPress }: ButtonProps) {
  const t = useTheme();
  const busy = useCardBusy();
  const off = disabled || busy;
  const filled = kind === 'filled';
  const tonal = kind === 'tonal';
  const outlined = kind === 'outlined';
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: off }}
    disabled={off}
    onPress={onPress}
    hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
    android_ripple={{ color: (filled ? t.onPrimary : t.primary).slice(0, 7) + '1F', foreground: true }}
    style={[styles.button, kind === 'text' && { paddingHorizontal: 8 }, large && styles.large, tonal && styles.tonal, outlined && [styles.outlined, { borderColor: off ? t.text : t.outline }], (filled || tonal) && { backgroundColor: off ? t.text + '1F' : filled ? t.primary : t.primaryContainer }]}>
    <Text style={[type.label, large && styles.largeLabel, { color: filled ? (off ? t.text : t.onPrimary) : tonal ? (off ? t.text : t.onPrimaryContainer) : t.primary }, off && { opacity: 0.38 }]}>{label}</Text>
  </Pressable>;
}

/** A round icon-only action beside a card's main button; [label] is what a screen reader says. */
export function IconButton({ icon: Icon, label, disabled = false, onPress }: { icon: ComponentType<{ size: number; color: string }>; label: string; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  const busy = useCardBusy();
  const off = disabled || busy;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: off }}
    disabled={off}
    onPress={onPress}
    hitSlop={4}
    android_ripple={{ color: t.primary.slice(0, 7) + '1F', foreground: true, borderless: false }}
    style={[styles.icon, { backgroundColor: t.primary.slice(0, 7) + '14' }, off && { opacity: 0.38 }]}>
    <Icon size={20} color={t.primary} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: {
    height: 40,
    borderRadius: shape.round,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  large: { height: 56 },
  tonal: { paddingHorizontal: 16 },
  // A tappable answer: a light 1dp outline with a 48dp target (minHeight wins over height).
  outlined: { minHeight: 48, borderWidth: 1, paddingHorizontal: 16 },
  icon: { width: 40, height: 40, borderRadius: shape.round, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  largeLabel: { fontSize: 16, lineHeight: 24 },
});
