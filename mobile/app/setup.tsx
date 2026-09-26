import { useEffect, useRef, useState } from 'react';
import { AppState, Animated, BackHandler, Easing, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { Dot } from '../src/ui/Dot';
import { ChatIcon, HandIcon, LockIcon } from '../src/ui/icons';
import { shape, space, type, useReducedMotion, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import * as Onboarding from '../src/core/onboarding';
import type { Step } from '../src/core/onboarding';
import { store } from '../src/core/store';
import Native from '../modules/ownvoice-native';

type Saved = { step: Step; inserted: boolean };
type Offered = { app: string; name: string; icon: string | null };

const readSaved = (): Saved => {
  const saved = store.get<Saved>('setup');
  return { step: saved?.step ?? Onboarding.first(!!store.get('setup-done')), inserted: !!saved?.inserted };
};

/** The first run: the welcome, the permission explained kindly, a practice chat that ends in a first
 *  inserted draft, and "Where should I help?". Steps follow the ported step machine in core/onboarding;
 *  leaving by any route (Done, Back, or the step after the last one) counts as done, and the home
 *  switch later opens straight at the permission (Onboarding.first). */
export default function Setup() {
  const t = useTheme();
  const inset = useSafeAreaInsets().top;
  const [{ step, inserted }, setSaved] = useState<Saved>(readSaved);
  const [serviceOn, setServiceOn] = useState(false);
  const [installed, setInstalled] = useState<Offered[] | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [greyed, setGreyed] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  // The handlers that leave the screen (Done, Back) read the step at tap time, not mount time.
  const latest = useRef({ step, installed, choices });
  latest.current = { step, installed, choices };

  const set = (update: (current: Saved) => Saved) => setSaved(update);

  const finish = async () => {
    if (savingRef.current) return;
    const { step: now, installed: shown, choices: picked } = latest.current;
    if (now === 'APPS' && !shown) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (now === 'APPS' && shown) {
        const rules = await Native.bubbleRules();
        const shownApps = new Set(shown.map(({ app }) => app));
        const on = rules.on.filter(app => !shownApps.has(app));
        const off = rules.off.filter(app => !shownApps.has(app));
        for (const { app } of shown) (picked[app] ?? true ? on : off).push(app);
        await Native.setBubbleRules({ paused: rules.paused, on, off });
      }
      store.set('setup-done', true);
      store.set('setup', null);
      router.replace('/');
    } catch {
      setSaving(false);
      savingRef.current = false;
    }
  };

  useEffect(() => {
    let live = true;
    // The one-time model download runs quietly behind setup (the home card reports problems later).
    Native.modelStatus().then(s => { if (s === 'downloadable') Native.downloadModel().catch(() => {}); }).catch(() => {});
    Native.serviceState().then(s => { if (live) setServiceOn(s === 'on'); }).catch(() => {});
    Native.launcherApps(true).then(apps => {
      if (live) setInstalled(Onboarding.offeredApps(a => apps.some(x => x.app === a))
        .map(([app, name]) => ({ app, name, icon: apps.find(x => x.app === app)?.icon ?? null })));
    }).catch(() => { if (live) setInstalled([]); });
    const service = Native.addListener('onServiceChange', ({ state }) => setServiceOn(state === 'on'));
    // The first draft inserted into the practice chat ends the step (B11).
    const done = Native.addListener('onInserted', ({ ok }) => { if (ok) set(current => current.step === 'TRY' ? { ...current, inserted: true } : current); });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { void finish(); return true; });
    return () => {
      live = false;
      service.remove(); done.remove(); back.remove();
      Native.setPractice(false).catch(() => {});
    };
  }, []);

  // Where setup is now is saved, so rotation and process death come back to the same step (S7);
  // the bubble works on the practice chat only while that step is in front (never saved, never while paused).
  useEffect(() => {
    store.set('setup', { step, inserted });
    Native.setPractice(step === 'TRY').catch(() => {});
  }, [step, inserted]);

  // Once the service is on, the permission step has done its job and setup moves on (B10's return).
  useEffect(() => {
    if (serviceOn && step === 'PERMISSION') advance();
  }, [serviceOn, step, installed]);

  // A small copy of the phone's own row and switch, the switch flipping on and off (S3).
  useEffect(() => {
    if (step !== 'PERMISSION') { setHintOn(false); return; }
    const id = setInterval(() => setHintOn(on => !on), 1400);
    return () => clearInterval(id);
  }, [step]);

  const advance = (from?: Step) => {
    const current = from ?? latest.current.step;
    if ((current === 'PERMISSION' && !serviceOn || current === 'TRY') && !latest.current.installed) return;
    const next = Onboarding.next(current, serviceOn, !!store.get('setup-done'), (latest.current.installed?.length ?? 0) > 0);
    if (next === 'DONE') void finish();
    else set(current => ({ ...current, step: next }));
  };

  const field = useRef<TextInput>(null);
  // The practice field is focused without the keyboard (like Kotlin's requestFocus), so one tap on
  // the bubble is enough; autoFocus would open the keyboard before the no-keyboard flag applies.
  // The step usually mounts while the settings app is in front (the user just switched Ownvoice on),
  // so focus again whenever the app comes back to the front.
  useEffect(() => {
    if (step !== 'TRY') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      if (timer) clearTimeout(timer);
      // showSoftInputOnFocus=false keeps the keyboard down; Keyboard.dismiss() would blur the field.
      timer = setTimeout(() => field.current?.focus(), 300);
    };
    attempt();
    // Try again whenever the app comes back to the front; focus attempts on a backgrounded
    // window do nothing, and setup usually sits behind the settings app at this point.
    const state = AppState.addEventListener('change', next => { if (next === 'active') attempt(); });
    return () => { if (timer) clearTimeout(timer); state.remove(); };
  }, [step]);

  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const };
  const centre = styles.centre;

  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={[styles.page, { paddingTop: inset + 16 }]} keyboardShouldPersistTaps="always">
    {step === 'WELCOME' && <Welcome onContinue={() => advance()} />}
    {step === 'PERMISSION' && <View>
      <Text style={[type.headline, centre, { color: t.text }]}>{words.permissionTitle}</Text>
      <Text style={[type.body, centre, { color: t.muted, marginTop: space.s, marginBottom: space.l, paddingHorizontal: space.s }]}>{words.permissionSubtitle}</Text>
      <View style={[group, { gap: 2 }]}>
        <Row lead={<HandIcon size={24} color={t.primary} />} title={words.promiseTap} subtitle={words.promiseTapNote} />
        <Row lead={<LockIcon size={24} color={t.primary} />} title={words.promisePhone} subtitle={words.promisePhoneNote} />
        <Row lead={<ChatIcon size={24} color={t.primary} />} title={words.promiseSend} subtitle={words.promiseSendNote} />
      </View>
      <Text style={[type.body, centre, { color: t.text, marginTop: space.l, marginBottom: space.s }]}>{words.permission}</Text>
      <View style={[group, { marginBottom: space.m }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Row title={words.switchRowApp} subtitle={hintOn ? words.on : words.off} />
        <Row title={words.switchRowAction} end={<View pointerEvents="none"><Switch value={hintOn} onValueChange={() => {}} /></View>} />
      </View>
      <Text style={[type.body, centre, { color: t.text }]}>{words.fullControl}</Text>
      <View style={{ minHeight: space.xxl }} />
      <Button kind="filled" label={words.turnOn} onPress={() => { Native.openAccessibilitySettings().catch(() => {}); }} />
      <View style={styles.actions}>
        <Button kind="text" label={words.notNow} onPress={() => advance()} />
        <Button kind="text" label={words.switchGreyed} onPress={() => { setGreyed(true); Native.openAppInfo().catch(() => {}); }} />
      </View>
      {greyed && <Text style={[type.body, centre, { color: t.muted, marginTop: space.xs }]}>{words.greyedHelp}</Text>}
    </View>}
    {step === 'TRY' && <View>
      <Text style={[type.headline, centre, { color: t.text }]}>{words.tryTitle}</Text>
      <Text style={[type.body, centre, { color: t.muted, marginTop: space.s, marginBottom: space.l, paddingHorizontal: space.s }]}>
        {inserted ? words.tryDone : serviceOn ? words.tryInsert : words.tryTurnOnFirst}
      </Text>
      <View style={[styles.chat, { backgroundColor: t.card }]}>
        <Text style={[type.title, { color: t.text, marginBottom: space.m }]}>{words.practiceFriend}</Text>
        <Text style={[type.body, styles.received, { backgroundColor: t.yours, color: t.text }]}>{words.practiceMessage1}</Text>
        <Text style={[type.body, styles.received, { backgroundColor: t.yours, color: t.text }]}>{words.practiceMessage2}</Text>
        <TextInput
          ref={field}
          accessibilityLabel={words.practiceField}
          placeholder={words.practiceField}
          placeholderTextColor={t.muted}
          autoCapitalize="sentences"
          showSoftInputOnFocus={false}
          multiline
          style={[type.body, styles.field, { color: t.text, backgroundColor: t.card, borderColor: t.cardLine }]} />
      </View>
      <Text style={[type.body, centre, { color: t.text, marginTop: space.m }]}>{words.practiceNote}</Text>
      <View style={{ minHeight: space.xxl }} />
      {inserted
        ? <Button kind="filled" label={words.continueLabel} onPress={() => advance()} />
        : <View style={styles.skip}><Button kind="text" label={words.skip} onPress={() => advance()} /></View>}
    </View>}
    {step === 'APPS' && <View>
      <Text style={[type.headline, centre, { color: t.text }]}>{words.appsTitle}</Text>
      <Text style={[type.body, centre, { color: t.muted, marginTop: space.s, marginBottom: space.l, paddingHorizontal: space.s }]}>{words.appsNote}</Text>
      <View style={[group, { gap: 2 }]}>
        {(installed ?? []).map(({ app, name, icon }) =>
          <Row key={app}
            lead={icon ? <Image source={{ uri: `data:image/png;base64,${icon}` }} style={styles.appIcon} /> : undefined}
            title={name}
            end={<View pointerEvents="none"><Switch value={choices[app] ?? true} onValueChange={() => toggle(app)} /></View>}
            onPress={() => toggle(app)} />)}
      </View>
      <View style={{ minHeight: space.xxl }} />
      <Button kind="filled" disabled={!installed || saving} label={words.done} onPress={() => { void finish(); }} />
    </View>}
  </ScrollView>;

  function toggle(app: string) {
    setChoices(current => ({ ...current, [app]: !(current[app] ?? true) }));
  }
}

/** The bubble itself, as it will look in other apps: Dot waving hello (still when motion is reduced). */
function Welcome({ onContinue }: { onContinue: () => void }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const wave = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced !== false) return;
    const swing = (value: number) => Animated.timing(wave, { toValue: value, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([swing(1), swing(0)]));
    loop.start();
    return () => loop.stop();
  }, [reduced, wave]);
  return <View style={styles.welcome}>
    <View style={{ flex: 1 }} />
    <Animated.View style={{ transform: [{ rotate: wave.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '5deg'] }) }] }}>
      <Dot mood="hello" size={96} />
    </Animated.View>
    <Text style={[type.headline, styles.centre, { color: t.text, marginTop: space.l }]}>{words.welcomeTitle}</Text>
    <View style={{ flex: 1 }} />
    <Button kind="filled" label={words.continueLabel} onPress={onContinue} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 28 },
  centre: { textAlign: 'center' as const },
  welcome: { flex: 1, alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: space.m, marginTop: space.m, flexWrap: 'wrap' },
  chat: { borderRadius: 24, padding: space.l, gap: space.s },
  received: { alignSelf: 'flex-start', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  field: { minHeight: 48, marginRight: 34, marginTop: space.xs, borderWidth: 1, borderRadius: 24, paddingHorizontal: space.l, paddingVertical: space.m, textAlignVertical: 'top' },
  skip: { alignItems: 'center' },
  appIcon: { width: 40, height: 40, borderRadius: 10 },
});
