import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, BackHandler, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dot } from './Dot';
import type { Mood } from './dot';
import { CloseIcon } from './icons';
import { shape, space, type, useReducedMotion, useTheme } from './theme';

export type Cover = { title: string; children: ReactNode };

type SheetProps = {
  title: string;
  note?: string;
  mood?: Mood;
  onClose: () => void;
  children: ReactNode;
  /** The second body (the Why? note). While a cover is given, X, Back and an outside tap return to the main body. */
  cover?: Cover;
  onCloseCover?: () => void;
};

/** The bottom sheet. Slides up, holds still for less motion, and fades out when it closes. */
export function Sheet({ title, note, mood, onClose, children, cover, onCloseCover }: SheetProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const covered = !!cover;
  const closing = useRef(false);
  const slide = useRef(new Animated.Value(reduced === true ? 0 : 600)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current || reduced === null) return;
    opened.current = true;
    if (reduced) { slide.setValue(0); return; }
    Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.poly(2)), useNativeDriver: true }).start();
  }, [reduced, slide]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (reduced !== false) return onClose();
    Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => onClose());
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (covered) { onCloseCover?.(); return true; }
      close();
      return true;
    });
    return () => sub.remove();
  }, [covered]);

  const dismiss = () => (covered ? onCloseCover?.() : close());

  return <View style={styles.scrim}>
    <Pressable accessibilityLabel="Close" style={styles.outside} onPress={dismiss} />
    <Animated.View accessibilityViewIsModal style={[styles.sheet, {
      backgroundColor: t.sheet, borderTopLeftRadius: shape.sheet, borderTopRightRadius: shape.sheet,
      transform: [{ translateY: slide }], opacity: fade, paddingBottom: insets.bottom + 8,
    }]}>
      <View style={styles.handleWrap}><View style={[styles.handle, { backgroundColor: t.handle + '66' }]} /></View>
      <View style={styles.header}>
        {!covered && mood ? <View style={styles.dot}><Dot mood={mood} size={40} /></View> : null}
        <Text numberOfLines={1} style={[type.title, { color: t.text, flex: 1 }]}>{covered && cover ? cover.title : title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={dismiss} hitSlop={12} style={styles.close}>
          <CloseIcon size={24} color={t.muted} />
        </Pressable>
      </View>
      {note && !covered ? <Text style={[type.note, { color: t.muted, marginHorizontal: space.xl, marginTop: 2, marginBottom: space.l }]}>{note}</Text> : null}
      <ScrollView contentContainerStyle={styles.body}>
        {covered && cover ? cover.children : children}
      </ScrollView>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  outside: { flex: 1 },
  sheet: { flexShrink: 1, marginTop: 56, borderTopLeftRadius: shape.sheet, borderTopRightRadius: shape.sheet },
  handleWrap: { alignItems: 'center', paddingTop: space.m, paddingBottom: space.s },
  handle: { width: 32, height: 4, borderRadius: shape.bar },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.xl, paddingRight: space.m },
  dot: { width: 40, height: 40, marginRight: space.m },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.l },
});
