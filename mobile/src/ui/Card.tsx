import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
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

/** A draft or version card: outlined for choices, filled for "Yours". Fades in as it lands. */
export function Card({ variant, label, busy = false, children }: CardProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced === true) { fade.setValue(1); return; }
    Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [reduced, fade]);
  return <Animated.View style={[styles.card, { opacity: fade }, variant === 'outlined'
    ? { backgroundColor: t.card, borderWidth: 1, borderColor: t.cardLine }
    : { backgroundColor: t.yours }]}>
    {label && <Text style={[type.label, { color: t.primary, marginBottom: space.xs }]}>{label}</Text>}
    <CardBusy.Provider value={busy}>{children}</CardBusy.Provider>
  </Animated.View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: shape.card,
    paddingHorizontal: space.l,
    paddingTop: space.l,
    paddingBottom: space.s,
  },
});
