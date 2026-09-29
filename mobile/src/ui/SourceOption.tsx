import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from './Badge';
import { CheckIcon } from './icons';
import { shape, space, type, useTheme } from './theme';

type SourceOptionProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** Trade-offs: `good` lines get a tick, the rest a neutral dot (never a warning). */
  lines?: { text: string; good: boolean }[];
  selected: boolean;
  /** An option this phone can't use: dimmed, no radio, not pressable. */
  unavailable?: boolean;
  onPress?: () => void;
  /** What the chosen option says and offers, under its name: outside the radio, so its buttons stay reachable. */
  children?: ReactNode;
};

/** One way Ownvoice can write, as a radio card: icon, name, what it means, and its trade-offs. */
export function SourceOption({ icon, title, subtitle, lines = [], selected, unavailable = false, onPress, children }: SourceOptionProps) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.raised, borderColor: selected ? t.primary : 'transparent' }, unavailable && styles.off]}>
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      android_ripple={{ color: t.text + '12', foreground: true }}
      style={styles.press}>
      <View style={styles.top}>
        <Badge>{icon}</Badge>
        <View style={styles.words}>
          <Text style={[type.label, styles.title, { color: t.text }]}>{title}</Text>
          <Text style={[type.note, { color: t.muted }]}>{subtitle}</Text>
        </View>
        {!unavailable && <View style={[styles.radio, { borderColor: selected ? t.primary : t.outline }]}>
          {selected && <View style={[styles.radioDot, { backgroundColor: t.primary }]} />}
        </View>}
      </View>
      {!unavailable && lines.length > 0 && <View style={styles.lines}>
        {lines.map(({ text, good }) => <View key={text} style={styles.line}>
          <View style={styles.mark}>{good ? <CheckIcon size={18} color={t.primary} /> : <View style={[styles.dot, { backgroundColor: t.outline }]} />}</View>
          <Text style={[type.note, styles.words, { color: t.text }]}>{text}</Text>
        </View>)}
      </View>}
    </Pressable>
    {children ? <View style={styles.more}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: shape.group, borderWidth: 2, overflow: 'hidden' },
  press: { padding: space.l - 2, gap: space.m },
  more: { paddingHorizontal: space.l - 2, paddingBottom: space.l - 2, gap: space.m },
  off: { opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l },
  words: { flex: 1 },
  title: { fontSize: 16, lineHeight: 24 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  lines: { gap: space.s, paddingLeft: 56 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mark: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
