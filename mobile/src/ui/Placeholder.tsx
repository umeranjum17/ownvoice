import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { shape, space, useReducedMotion, useTheme } from './theme';

const WIDTHS = ['92%', '70%', '45%'] as const;

/** Three soft bars where a card hasn't landed yet. Pulses; holds still when motion is reduced. */
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
  return <Animated.View style={{ opacity: pulse }}>
    {WIDTHS.map(width => <View key={width} style={[styles.bar, { width, backgroundColor: t.yours }]} />)}
  </Animated.View>;
}

const styles = StyleSheet.create({
  bar: { height: 14, borderRadius: shape.bar, marginBottom: space.m },
});
