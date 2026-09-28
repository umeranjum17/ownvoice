import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { shape, space, type, useReducedMotion, useTheme } from './theme';

// Card context so a busy card disables the Buttons inside it (while inserting).
const CardBusy = createContext(false);
export const useCardBusy = () => useContext(CardBusy);

type CardProps = {
  variant: 'outlined' | 'filled';
  label?: string;
  busy?: boolean;
  children: ReactNode;
};

/** A draft or version card: raised off the sheet for choices, tinted for "Yours". Rises in as it lands. */
export function Card({ variant, label, busy = false, children }: CardProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) { fade.setValue(1); return; }
    Animated.spring(fade, { toValue: 1, damping: 18, stiffness: 180, useNativeDriver: true }).start();
  }, [reduced, fade]);
  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View style={[styles.card, { opacity: fade, transform: [{ translateY: rise }] }, variant === 'outlined'
    ? { backgroundColor: t.raised }
    : { backgroundColor: t.yours }]}>
    {label && <Text style={[type.label, styles.label, { color: t.primary }]}>{label}</Text>}
    <CardBusy.Provider value={busy}>{children}</CardBusy.Provider>
  </Animated.View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: shape.sheet - 4,
    paddingHorizontal: space.l + 2,
    paddingTop: space.l + 2,
    paddingBottom: space.m,
  },
  label: { marginBottom: space.xs, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
});
