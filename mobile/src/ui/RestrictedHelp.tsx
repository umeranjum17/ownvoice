import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { CheckIcon, WarnIcon } from './icons';
import { shape, space, type, useTheme } from './theme';
import { words } from '../core/words';
import Native, { type Restricted } from '../../modules/ownvoice-native';

/** What the permission step shows about Android's block on apps installed outside Google Play:
 *  the steps while it holds, one line once it lifts while the step was open, else nothing. */
export type RestrictedView = Restricted | 'lifted';

/** Asks Android while [active], and again each time the person comes back from Settings or App info. */
export function useRestricted(active: boolean): RestrictedView {
  const [view, setView] = useState<RestrictedView>('clear');
  useEffect(() => {
    if (!active) { setView('clear'); return; }
    let live = true;
    const check = () => Native.restrictedSettings().then(now => {
      if (live) setView(was => now !== 'clear' ? now : was === 'clear' ? 'clear' : 'lifted');
    }).catch(() => {});
    check();
    const state = AppState.addEventListener('change', next => { if (next === 'active') check(); });
    return () => { live = false; state.remove(); };
  }, [active]);
  return view;
}

/** The card above Turn on. "Tried" is the state where App info offers the fix; before that, Android
 *  hides the menu item until the greyed switch was tapped once, so that comes first. */
export function RestrictedCard({ view }: { view: RestrictedView }) {
  const t = useTheme();
  if (view === 'clear') return null;
  if (view === 'lifted') return <View testID="restricted-lifted" style={[styles.card, styles.lifted, { backgroundColor: t.group }]}>
    <CheckIcon size={22} color={t.primary} />
    <Text style={[type.body, { color: t.text, flex: 1 }]}>{words.restrictedLifted}</Text>
  </View>;
  const steps = [...view === 'blocked' ? [words.restrictedTryFirst] : [], words.restrictedOpen, words.restrictedDots, words.restrictedAllow, words.restrictedBack];
  return <View testID="restricted-card" style={[styles.card, { backgroundColor: t.group }]}>
    <View style={styles.head}>
      <WarnIcon size={24} color={t.attention} />
      <Text accessibilityRole="header" style={[type.body, { color: t.text, fontWeight: '600', flex: 1 }]}>{words.restrictedTitle}</Text>
    </View>
    <Text style={[type.body, { color: t.text }]}>{words.restrictedNote}</Text>
    {steps.map((step, i) => <View key={step} style={styles.step}>
      <View style={[styles.number, { backgroundColor: t.primary }]}><Text style={[type.label, { color: t.onPrimary }]}>{i + 1}</Text></View>
      <Text style={[type.body, { color: t.text, flex: 1 }]}>{step}</Text>
    </View>)}
    <View style={styles.open}><Button kind="tonal" label={words.restrictedOpen} onPress={() => { Native.openAppInfo().catch(() => {}); }} /></View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: shape.group, padding: space.l, gap: space.m, marginBottom: space.xl },
  lifted: { flexDirection: 'row', alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  open: { alignItems: 'flex-start' },
});
