import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Animated, BackHandler, Easing, Image, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { Dot } from '../src/ui/Dot';
import { Badge } from '../src/ui/Badge';
import { ChatIcon, CheckIcon, HandIcon, LockIcon, PhoneIcon, WarnIcon } from '../src/ui/icons';
import { SourceOption } from '../src/ui/SourceOption';
import { shape, space, type, useReducedMotion, useTheme } from '../src/ui/theme';
import { say } from '@byokit/accounts';
import { words } from '../src/core/words';
import * as Onboarding from '../src/core/onboarding';
import type { Step } from '../src/core/onboarding';
import { store } from '../src/core/store';
import { completeSetup } from '../src/core/setup-completion';
import { saveBubbleRules } from '../src/chatgpt/settings';
import { NAME, session, nothing, type GptState } from '../src/chatgpt/session';
import { getSource, setSource, storedSource, type Source } from '../src/core/source';
import { phoneCanWrite, type PhoneCanWrite } from '../src/core/phoneStatus';
import { getReady, resume } from '../src/core/phoneDownload';
import Native from '../modules/ownvoice-native';

type Saved = { step: Step; inserted: boolean };
type Offered = { app: string; name: string; icon: string | null };

const readSaved = (): Saved => {
  const done = !!store.get('setup-done');
  const saved = done ? null : store.get<Saved>('setup');
  return { step: Onboarding.known(saved?.step) ?? Onboarding.first(done), inserted: !!saved?.inserted };
};

/** The first run: the welcome, how Ownvoice writes (this phone or the person's ChatGPT, signed in right
 *  here), the permission explained kindly, a practice chat that ends in a first inserted draft, and app
 *  choices. Steps follow core/onboarding; hardware Back leaves a sign-in for the choice, and otherwise
 *  completes setup. The home switch later opens at permission (Onboarding.first). */
export default function Setup() {
  const t = useTheme();
  const [{ step, inserted }, setSaved] = useState<Saved>(readSaved);
  const [serviceOn, setServiceOn] = useState(false);
  const [installed, setInstalled] = useState<Offered[] | null>(null);
  const [appsFailed, setAppsFailed] = useState(false);
  const mounted = useRef(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [greyed, setGreyed] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  const [typing, setTyping] = useState(false);
  const [phone, setPhone] = useState<PhoneCanWrite | null>(null);
  const [picked, setPicked] = useState<'phone' | 'chatgpt' | null>(null);
  const pick = picked ?? (phone === 'cant' ? 'chatgpt' : 'phone');
  // The ChatGPT sign-in, shown inside the choice step: null while the options show.
  const [gpt, setGpt] = useState<GptState | null>(null);
  const signing = useRef(0);
  // Whether this attempt started a new sign-in, rather than finding ChatGPT already connected.
  const fresh = useRef(false);
  const [source, setShownSource] = useState<Source>(() => storedSource() ?? null);
  // The handlers that leave the screen (Done, Back) read the step at tap time, not mount time.
  const latest = useRef({ step, inserted, installed, choices, gpt });
  latest.current = { step, inserted, installed, choices, gpt };

  const set = (update: (current: Saved) => Saved) => {
    const next = update(latest.current);
    try {
      store.set('setup', next);
      latest.current.step = next.step;
      latest.current.inserted = next.inserted;
      setSaved(next);
    } catch {}
  };

  const loadApps = () => {
    setAppsFailed(false);
    Native.launcherApps(Onboarding.offered.map(([app]) => app)).then(apps => {
      if (mounted.current) setInstalled(Onboarding.offeredApps(a => apps.some(x => x.app === a))
        .map(([app, name]) => ({ app, name, icon: apps.find(x => x.app === app)?.icon ?? null })));
    }).catch(() => { if (mounted.current) setAppsFailed(true); });
  };

  /** The apps the person left on, written into the bubble rules once, when they leave the apps step. */
  const saveApps = async () => {
    const { installed: shown, choices: picked } = latest.current;
    if (!shown) return;
    const rules = await Native.bubbleRules();
    const shownApps = new Set(shown.map(({ app }) => app));
    const on = rules.on.filter(app => !shownApps.has(app));
    const off = rules.off.filter(app => !shownApps.has(app));
    for (const { app } of shown) (picked[app] ?? true ? on : off).push(app);
    await saveBubbleRules({ paused: rules.paused, on, off });
  };

  const finish = async (leaving = false) => {
    if (savingRef.current) return;
    const { step: now, installed: shown } = latest.current;
    if (now === 'APPS' && !shown && !leaving) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (now === 'APPS' && shown) await saveApps();
      await completeSetup();
      router.replace('/');
    } catch {
      setSaving(false);
      savingRef.current = false;
    }
  };

  useEffect(() => {
    mounted.current = true;
    // A one-time download the person already agreed to picks up where it stopped; nothing starts without a yes.
    void resume();
    Native.serviceState().then(s => { if (mounted.current) setServiceOn(s === 'on'); }).catch(() => {});
    phoneCanWrite().then(can => { if (mounted.current) setPhone(can); });
    // A sign-in still waiting for its code (the screen was rebuilt) comes back to its code.
    if (latest.current.step === 'CHOOSE') session.current().then(now => { if (now.waiting) showSignIn(signing.current, now); }).catch(() => {});
    // A step saved by an older version at its last, optional ChatGPT offer: everything else was done.
    if (latest.current.step === 'DONE') void finish(true);
    loadApps();
    const service = Native.addListener('onServiceChange', ({ state }) => setServiceOn(state === 'on'));
    // The first draft inserted into the practice chat ends the step (B11).
    const done = Native.addListener('onInserted', ({ ok, practice }) => { if (ok && practice && latest.current.step === 'TRY') set(current => ({ ...current, inserted: true })); });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (latest.current.gpt) leaveSignIn();
      else void finish(true);
      return true;
    });
    return () => {
      mounted.current = false;
      service.remove(); done.remove(); back.remove();
      Native.setPractice(false).catch(() => {});
    };
  }, []);

  useEffect(() => {
    Native.setPractice(step === 'TRY').catch(() => {});
    // The permission's middle promise follows the choice; its first one says so when the typing check is on.
    if (step === 'PERMISSION') getSource().then(chosen => { if (mounted.current) setShownSource(chosen); }).catch(() => {});
    if (step === 'PERMISSION') Native.typingCheck().then(on => { if (mounted.current) setTyping(on); }).catch(() => {});
  }, [step]);

  // The approval happens on the ChatGPT page, so the step looks again while a code waits.
  useEffect(() => {
    if (!gpt?.waiting) return;
    const at = signing.current;
    const id = setInterval(() => { void session.current().then(now => showSignIn(at, now)).catch(() => {}); }, 1000);
    return () => clearInterval(id);
  }, [gpt?.waiting]);

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
    if ((current === 'PERMISSION' && !serviceOn || current === 'TRY') && !latest.current.installed) {
      if (appsFailed) {
        if (store.get('setup-done')) void finish();
        else set(saved => ({ ...saved, step: 'APPS' }));
      }
      return;
    }
    const next = Onboarding.next(current, serviceOn, !!store.get('setup-done'), (latest.current.installed?.length ?? 0) > 0);
    // finish saves the apps step's list on the way out.
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

  /** A sign-in answer, unless the person has left that sign-in since it started. */
  function showSignIn(at: number, next: GptState) {
    if (mounted.current && at === signing.current) setGpt(next);
  }

  /** ChatGPT chosen: straight to connected when already signed in, otherwise a new code. */
  const signIn = () => {
    const at = ++signing.current;
    fresh.current = false;
    setGpt({ ...nothing, waiting: true });
    void session.current()
      .then(async now => {
        if (now.signedIn || at !== signing.current) return now;
        fresh.current = true;
        const next = await session.start();
        // Left while the code was being made: drop it rather than leave it waiting.
        if (at !== signing.current) await session.cancel();
        return next;
      })
      .then(next => showSignIn(at, next))
      .catch(() => showSignIn(at, { ...nothing, note: words.failed }));
  };

  /** Back or Cancel from the sign-in: the choice again, and nothing kept. A waiting code is dropped,
   *  and an account connected just now is signed out again (one that was already there stays). */
  function leaveSignIn() {
    signing.current++;
    const left = latest.current.gpt;
    if (left?.waiting) void session.cancel().catch(() => {});
    else if (left?.signedIn && fresh.current) void session.signOut().catch(() => {});
    setGpt(null);
  }

  const copyAndOpen = () => {
    if (!gpt?.code) return;
    void Native.copy(gpt.code).catch(() => {});
    if (gpt.url) void Linking.openURL(gpt.url).catch(() => showSignIn(signing.current, { ...gpt, note: words.gptPageFailed }));
  };

  const choose = (chosen: 'phone' | 'chatgpt') => {
    try { setSource(chosen); } catch { return; }
    // Picking this phone where it still needs its one-time download is the yes to that download.
    if (chosen === 'phone' && phone === 'needsDownload') void getReady().catch(() => {});
    signing.current++;
    setGpt(null);
    advance('CHOOSE');
  };

  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const };
  const busyApps = !installed && !appsFailed;

  if (step === 'WELCOME') return <Welcome onContinue={() => advance()} />;
  if (step === 'DONE') return <View style={{ flex: 1, backgroundColor: t.sheet }} />;
  const phoneCan = phone !== null && phone !== 'cant';
  const gptOption = <SourceOption icon={<ChatIcon size={22} color={t.onPrimaryContainer} />} title={words.srcGpt} subtitle={words.srcGptSub} selected={pick === 'chatgpt'} onPress={() => setPicked('chatgpt')}
    lines={[{ text: words.tradeGpt1, good: true }, { text: words.tradeGpt2, good: false }, { text: words.tradeGpt3, good: false }]} />;
  return <Screen step={step} footer={<>
    {step === 'CHOOSE' && !gpt && (phone === 'cant'
      ? <>
        <Button kind="filled" large label={words.gptButton} onPress={signIn} />
        <View style={styles.skip}><Button kind="text" label={words.notNow} onPress={() => { void finish(); }} /></View>
      </>
      : <Button kind="filled" large disabled={!phone} label={pick === 'phone' && phone === 'needsDownload' ? words.getReady : words.continueLabel} onPress={() => pick === 'phone' ? choose('phone') : signIn()} />)}
    {step === 'CHOOSE' && gpt?.waiting && <>
      <Button kind="filled" large disabled={!gpt.code} label={words.copyAndOpen} onPress={copyAndOpen} />
      <View style={styles.skip}><Button kind="text" label={words.gptCancel} onPress={leaveSignIn} /></View>
    </>}
    {step === 'CHOOSE' && gpt?.signedIn && <Button kind="filled" large label={words.continueLabel} onPress={() => choose('chatgpt')} />}
    {step === 'CHOOSE' && gpt && !gpt.waiting && !gpt.signedIn && <>
      <Button kind="filled" large label={words.tryAgain} onPress={signIn} />
      {phoneCan && <View style={styles.skip}><Button kind="text" label={words.usePhoneInstead} onPress={() => {
        // A phone that still needs its download goes back to the choice, where the ask and its size show.
        if (phone === 'needsDownload') { signing.current++; setGpt(null); setPicked('phone'); } else choose('phone');
      }} /></View>}
    </>}
    {step === 'PERMISSION' && <>
      <Button kind="filled" large label={words.turnOn} onPress={() => { Native.openAccessibilitySettings(true).catch(() => {}); }} />
      <View style={styles.actions}>
        <Button kind="text" disabled={busyApps} label={words.notNow} onPress={() => advance()} />
        <Button kind="text" label={words.switchGreyed} onPress={() => { setGreyed(true); Native.openAppInfo().catch(() => {}); }} />
      </View>
    </>}
    {step === 'TRY' && (inserted
      ? <Button kind="filled" large disabled={busyApps} label={words.continueLabel} onPress={() => advance()} />
      : <View style={styles.skip}><Button kind="text" disabled={busyApps} label={words.skip} onPress={() => advance()} /></View>)}
    {step === 'APPS' && <Button kind="filled" large disabled={!installed || saving} label={words.done} onPress={() => advance()} />}
  </>}>
    {step === 'CHOOSE' && !gpt && <>
      <Head title={words.chooseTitle} note={phone === 'cant' ? words.chooseNoteCant : words.chooseNote} />
      {phone && <View style={styles.options} accessibilityRole="radiogroup">
        {phone === 'cant'
          ? <>{gptOption}<SourceOption icon={<PhoneIcon size={22} color={t.onPrimaryContainer} />} title={words.srcPhone} subtitle={words.srcPhoneCant} selected={false} unavailable
            reason={<Text style={[type.note, { color: t.text, paddingLeft: 56 }]}>{words.phoneCantWhy}</Text>} /></>
          : <><SourceOption icon={<PhoneIcon size={22} color={t.onPrimaryContainer} />} title={words.srcPhone} subtitle={words.srcPhoneSub} selected={pick === 'phone'} onPress={() => setPicked('phone')}
            lines={[{ text: words.tradePhone1, good: true }, { text: words.tradePhone2, good: true }, { text: words.tradePhone3, good: false }]} />{gptOption}</>}
      </View>}
      {pick === 'phone' && phone === 'needsDownload' && <View style={[styles.fine, { backgroundColor: t.group, marginTop: space.l }]}>
        <Text style={[type.label, { color: t.text }]}>{words.readyTitle}</Text>
        <Text style={[type.note, { color: t.muted }]}>{words.readyNote}</Text>
      </View>}
    </>}
    {step === 'CHOOSE' && gpt?.waiting && <>
      <Head title={words.signInTitle} note={words.signInNote} />
      <View style={[styles.code, { backgroundColor: t.raised }]}>
        {gpt.code && <>
          <Text style={[type.label, { color: t.muted, textAlign: 'center' }]}>{words.yourCode}</Text>
          <Text testID="sign-in-code" accessibilityLabel={`${words.yourCode} ${gpt.code.split('').join(' ')}`} style={[type.headline, styles.codeText, { color: t.text }]}>{gpt.code}</Text>
        </>}
        <View style={styles.waiting}>
          <ActivityIndicator size="small" color={t.primary} />
          <Text style={[type.note, { color: t.muted }]}>{gpt.code ? words.waiting : gpt.note ?? words.waiting}</Text>
        </View>
      </View>
      <View style={[styles.fine, { backgroundColor: t.group, marginTop: space.l }]}>
        <Text style={[type.note, { color: t.muted }]}>{say('terms.grey', { name: NAME, company: 'OpenAI' })}</Text>
      </View>
    </>}
    {step === 'CHOOSE' && gpt?.signedIn && <>
      <View style={styles.connectedDot}><Dot mood="done" size={112} /></View>
      <Head title={words.gptSignedInNow.replace(/\.$/, '')} note={words.connectedNote} />
      <View style={[styles.sent, { backgroundColor: t.group }]}>
        <Badge><LockIcon size={22} color={t.onPrimaryContainer} /></Badge>
        <Text style={[type.body, { color: t.text, flex: 1 }]}>{`${words.privacyGpt} ${words.sentOnlyOnTap}`}</Text>
      </View>
    </>}
    {step === 'CHOOSE' && gpt && !gpt.waiting && !gpt.signedIn && <Head title={words.signInTitle} note={gpt.note ?? words.failed} />}
    {step === 'PERMISSION' && <>
      <Head title={words.permissionTitle} note={words.permissionSubtitle} />
      <View style={[group, { gap: 2 }]}>
        <Row lead={<Badge><HandIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={typing ? words.promiseTapTyping : words.promiseTap} subtitle={typing ? words.promiseTapTypingNote : words.promiseTapNote} />
        {source === 'chatgpt'
          ? <Row lead={<Badge><LockIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.promiseGpt} subtitle={words.promiseGptNote} />
          : <Row lead={<Badge><LockIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.promiseStays} subtitle={words.promiseStaysNote} />}
        <Row lead={<Badge><ChatIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.promiseSend} subtitle={words.promiseSendNote} />
      </View>
      <Text style={[type.label, { color: t.primary, marginTop: space.xl, marginBottom: space.s }]}>{words.permissionNext}</Text>
      <View style={[styles.guide, { backgroundColor: t.card, borderColor: t.cardLine }]}>
        {([
          [words.stepApp, null, null],
          [words.stepSwitch, null, <View key="switch" style={[styles.mock, { backgroundColor: t.group }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text style={[type.body, { color: t.text }]}>{words.switchRowAction}</Text>
            <View pointerEvents="none"><Switch value={hintOn} onValueChange={() => {}} /></View>
          </View>],
          [words.stepAllow, words.fullControl, null],
        ] as const).map(([title, note, mock], i, all) => <View key={title} style={styles.step}>
          <View style={styles.rail}>
            <View style={[styles.number, { backgroundColor: t.primary }]}><Text style={[type.label, { color: t.onPrimary }]}>{i + 1}</Text></View>
            {i < all.length - 1 && <View style={[styles.line, { backgroundColor: t.line }]} />}
          </View>
          <View style={[styles.stepBody, i < all.length - 1 && { paddingBottom: space.m }]}>
            <Text style={[type.body, { color: t.text, fontWeight: '600' }]}>{title}</Text>
            {note ? <Text style={[type.note, { color: t.muted, marginTop: 2 }]}>{note}</Text> : null}
            {mock}
          </View>
        </View>)}
      </View>
      {greyed && <Text style={[type.body, { color: t.text, marginTop: space.l }]}>{words.greyedHelp}</Text>}
    </>}
    {step === 'TRY' && <>
      <Head title={inserted ? words.tryDoneTitle : words.tryTitle} note={inserted ? words.tryDone : serviceOn ? words.tryInsert : words.tryTurnOnFirst} done={inserted} />
      <View style={[styles.chat, { backgroundColor: t.card, borderColor: t.cardLine }]}>
        <View style={styles.chatHead}>
          <View style={[styles.avatar, { backgroundColor: t.glow }]}><Text style={[type.label, { color: t.text }]} importantForAccessibility="no">{words.practiceFriend[0]}</Text></View>
          <Text testID="practice-line-friend" style={[type.label, { color: t.text }]}>{words.practiceFriend}</Text>
        </View>
        <Text testID="practice-line-first" style={[type.body, styles.received, { backgroundColor: t.yours, color: t.text }]}>{words.practiceMessage1}</Text>
        <Text testID="practice-line-second" style={[type.body, styles.received, { backgroundColor: t.yours, color: t.text }]}>{words.practiceMessage2}</Text>
        <TextInput
          ref={field}
          accessibilityLabel={words.practiceField}
          placeholder={words.practiceField}
          placeholderTextColor={t.muted}
          autoCapitalize="sentences"
          showSoftInputOnFocus={false}
          multiline
          style={[type.body, styles.field, { color: t.text, backgroundColor: t.sheet, borderColor: t.cardLine }]} />
      </View>
      <View style={styles.aside}>
        <LockIcon size={16} color={t.muted} />
        <Text style={[type.note, { color: t.muted, flex: 1 }]}>{words.practiceNote}</Text>
      </View>
    </>}
    {step === 'APPS' && <>
      <Head title={words.appsTitle} note={words.appsNote} />
      {!!installed?.length && <View style={[group, { gap: 2 }]}>
        {installed.map(({ app, name, icon }) =>
          <Row key={app}
            lead={icon ? <Image source={{ uri: `data:image/png;base64,${icon}` }} style={styles.appIcon} /> : undefined}
            title={name}
            disabled={saving}
            end={<View pointerEvents="none"><Switch value={choices[app] ?? true} onValueChange={() => toggle(app)} /></View>}
            onPress={() => toggle(app)} />)}
      </View>}
      {appsFailed && <View style={[styles.problem, { backgroundColor: t.group }]}>
        <WarnIcon size={24} color={t.attention} />
        <Text style={[type.body, { color: t.text, flex: 1 }]}>{words.appsUnavailable}</Text>
        <Button kind="text" label={words.tryAgain} onPress={loadApps} />
      </View>}
    </>}
  </Screen>;

  function toggle(app: string) {
    if (!savingRef.current) setChoices(current => ({ ...current, [app]: !(current[app] ?? true) }));
  }
}

const STEPPED: Step[] = ['CHOOSE', 'PERMISSION', 'TRY', 'APPS'];

/** A setup step: where you are, the step's words scrolling, and its actions held at the bottom. */
function Screen({ step, footer, children }: { step: Step; footer: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const at = STEPPED.indexOf(step);
  return <View style={{ flex: 1, backgroundColor: t.sheet }}>
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: top + space.l }]} keyboardShouldPersistTaps="always">
      <View testID="setup-steps" style={styles.steps} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPPED.length, now: at + 1 }}>
        {STEPPED.map((s, i) => <View key={s} style={[styles.stepBar, { backgroundColor: i <= at ? t.primary : t.yours }]} />)}
      </View>
      {children}
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: bottom + space.l }]}>{footer}</View>
  </View>;
}

/** A step's one big line and its plain explanation; a check once the step is done. */
function Head({ title, note, done = false }: { title: string; note: string; done?: boolean }) {
  const t = useTheme();
  return <View style={styles.head}>
    <View style={styles.headTitle}>
      <Text accessibilityRole="header" style={[type.display, { color: t.text, flexShrink: 1 }]}>{title}</Text>
      {done && <Cheer />}
    </View>
    <View style={styles.headNote}>
      {done && <View style={[styles.tick, { backgroundColor: t.primary }]}><CheckIcon size={16} color={t.onPrimary} /></View>}
      <Text style={[type.body, { color: done ? t.text : t.muted, flex: 1 }]}>{note}</Text>
    </View>
  </View>;
}

/** Dot celebrating a step that worked: one spring in from small, a little tilt that settles. Still when motion is reduced. */
function Cheer() {
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) { pop.setValue(1); return; }
    Animated.spring(pop, { toValue: 1, damping: 9, stiffness: 160, mass: 0.8, useNativeDriver: true }).start();
  }, [reduced, pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const rotate = pop.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] });
  return <Animated.View style={{ opacity: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ scale }, { rotate }] }}>
    <Dot mood="done" size={52} />
  </Animated.View>;
}

/** The first screen shows the whole idea at a glance: a friend's message, Dot, and a reply in your
 *  words landing, one after another. Everything holds still when motion is reduced. */
function Welcome({ onContinue }: { onContinue: () => void }) {
  const t = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const beats = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const wave = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) { beats.forEach(b => b.setValue(1)); return; }
    const land = (value: Animated.Value) => Animated.spring(value, { toValue: 1, damping: 16, stiffness: 140, mass: 1, useNativeDriver: true });
    const swing = (value: number) => Animated.timing(wave, { toValue: value, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const waving = Animated.loop(Animated.sequence([swing(1), swing(0)]), { iterations: 2 });
    const show = Animated.sequence([Animated.stagger(420, beats.map(land)), waving]);
    show.start();
    return () => show.stop();
  }, [reduced, beats, wave]);
  const rise = (value: Animated.Value, by = 14) => ({ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [by, 0] }) }] });
  return <View style={[styles.welcome, { backgroundColor: t.sheet, paddingTop: top + space.xl }]}>
    <ScrollView contentContainerStyle={styles.welcomeScroll}>
      <View style={styles.stage} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.halo, { backgroundColor: t.glow }]} />
        <Animated.View style={[styles.theirs, rise(beats[0]), { backgroundColor: t.card, borderColor: t.cardLine }]}>
          <Text style={[type.label, { color: t.muted }]}>{words.practiceFriend}</Text>
          <Text style={[type.body, { color: t.text }]}>{words.practiceMessage1}</Text>
        </Animated.View>
        <Animated.View style={[styles.dot, { opacity: beats[1], transform: [
          { scale: beats[1].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { rotate: wave.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'] }) },
        ] }]}>
          <Dot mood="hello" size={88} />
        </Animated.View>
        <Animated.View style={[styles.mine, rise(beats[2], 22), { backgroundColor: t.primaryContainer }]}>
          <Text style={[type.body, { color: t.onPrimaryContainer }]}>{words.welcomeReply}</Text>
          <View style={[styles.chip, { backgroundColor: t.primary }]}>
            <CheckIcon size={14} color={t.onPrimary} />
            <Text style={[type.label, { color: t.onPrimary }]}>{words.insert}</Text>
          </View>
        </Animated.View>
      </View>
      <View style={styles.pitch}>
        <Text accessibilityRole="header" style={[type.display, styles.big, { color: t.text }]}>{words.welcomeTitle}</Text>
        <Text style={[type.words, { color: t.muted, marginTop: space.m }]}>{words.welcomeNote}</Text>
      </View>
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: bottom + space.l }]}>
      <Button kind="filled" large label={words.continueLabel} onPress={onContinue} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: space.xl, paddingBottom: space.xl },
  steps: { flexDirection: 'row', gap: 6, marginBottom: space.xl },
  stepBar: { flex: 1, height: 4, borderRadius: 2 },
  head: { marginBottom: space.xl },
  headTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m },
  headNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s, marginTop: space.s },
  tick: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: space.xl, paddingTop: space.m, gap: space.xs },
  // Text buttons are 40 dp; the 4 dp of padding lets their hit slop reach the 48 dp touch target.
  actions: { flexDirection: 'row', justifyContent: 'center', gap: space.xs, flexWrap: 'wrap', paddingVertical: space.xs },
  guide: { borderWidth: 1, borderRadius: shape.group, paddingHorizontal: space.l, paddingVertical: space.m },
  step: { flexDirection: 'row', gap: space.m },
  rail: { alignItems: 'center', width: 28 },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginTop: space.xs, borderRadius: 1 },
  stepBody: { flex: 1, paddingTop: 2 },
  mock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: shape.card, paddingHorizontal: space.l, minHeight: 44, marginTop: space.xs },
  chat: { borderRadius: 28, borderWidth: 1, padding: space.l, gap: space.s },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.xs },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  received: { alignSelf: 'flex-start', borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden', maxWidth: '88%' },
  field: { minHeight: 48, marginRight: 34, marginTop: space.s, borderWidth: 1, borderRadius: 24, paddingHorizontal: space.l, paddingVertical: space.m, textAlignVertical: 'top' },
  aside: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.m, paddingHorizontal: space.xs },
  skip: { alignItems: 'center', paddingVertical: space.xs },
  appIcon: { width: 40, height: 40, borderRadius: 12 },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space.m, borderRadius: shape.group, paddingLeft: space.l, paddingVertical: space.s, marginTop: space.m },
  fine: { borderRadius: shape.group, padding: space.l, gap: space.s },
  options: { gap: space.m },
  code: { borderRadius: shape.group, padding: space.l, gap: space.xs },
  codeText: { letterSpacing: 4, textAlign: 'center', paddingVertical: space.m },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: space.s },
  connectedDot: { alignItems: 'center', marginTop: space.s, marginBottom: space.l },
  sent: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l, borderRadius: shape.group, padding: space.l },
  welcome: { flex: 1 },
  welcomeScroll: { flexGrow: 1 },
  stage: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.l },
  halo: { position: 'absolute', alignSelf: 'center', width: 320, height: 320, borderRadius: 160 },
  theirs: { alignSelf: 'flex-start', maxWidth: '82%', borderWidth: 1, borderRadius: 24, borderBottomLeftRadius: 6, paddingHorizontal: space.l, paddingVertical: space.m },
  dot: { alignSelf: 'center', marginVertical: space.m },
  mine: { alignSelf: 'flex-end', maxWidth: '86%', borderRadius: 24, borderBottomRightRadius: 6, paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.m, gap: space.m },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: shape.round, paddingHorizontal: space.m, paddingVertical: 6 },
  pitch: { paddingHorizontal: space.xl, paddingBottom: space.l },
  big: { fontSize: 36, lineHeight: 42 },
});
