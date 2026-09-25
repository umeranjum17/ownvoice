import { useContext } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { shape, type, useTheme } from './theme';
import { useCardBusy } from './Card';

type ButtonProps = {
  kind: 'filled' | 'text';
  label: string;
  disabled?: boolean;
  onPress: () => void;
};

/** A Material pill button. Filled is the one main action on a card; text for the rest. */
export function Button({ kind, label, disabled = false, onPress }: ButtonProps) {
  const t = useTheme();
  const busy = useCardBusy();
  const off = disabled || busy;
  const filled = kind === 'filled';
  return <Pressable
    accessibilityRole="button"
    disabled={off}
    onPress={onPress}
    hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
    android_ripple={{ color: (filled ? t.onPrimary : t.primary).slice(0, 7) + '1F', foreground: true }}
    style={[styles.button, filled && { backgroundColor: off ? t.text + '1F' : t.primary }]}>
    <Text style={[type.label, { color: filled ? (off ? t.text : t.onPrimary) : t.primary }, off && { opacity: 0.38 }]}>{label}</Text>
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
});
