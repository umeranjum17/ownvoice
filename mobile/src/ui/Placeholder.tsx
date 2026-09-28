import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { shape, space, useReducedMotion, useTheme } from './theme';

const WIDTHS = ['92%', '70%', '45%'] as const;

/** A card's shape with three soft bars, where a draft hasn't landed yet. Pulses; holds still when motion is reduced. */
export function Placeholder() {
  const t = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(reduced ? 0.7 : 1)).current;
  useEffect(() => {
    if (reduced) { pulse.setValue(0.7); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return <View style={[styles.card, { backgroundColor: t.raised }]}>
    <Animated.View style={{ opacity: pulse }}>
      {WIDTHS.map(width => <View key={width} style={[styles.bar, { width, backgroundColor: t.yours }]} />)}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: shape.sheet - 4, paddingHorizontal: space.l + 2, paddingTop: space.l + 4, paddingBottom: space.s },
  bar: { height: 14, borderRadius: shape.bar, marginBottom: space.m },
});
