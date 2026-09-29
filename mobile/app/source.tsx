import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { say } from '@byokit/accounts';
import { Badge } from '../src/ui/Badge';
import { Button } from '../src/ui/Button';
import { Page } from '../src/ui/Page';
import { PhoneWriter } from '../src/ui/PhoneWriter';
import { Row } from '../src/ui/Row';
import { Sheet } from '../src/ui/Sheet';
import { SourceOption } from '../src/ui/SourceOption';
import { ChatIcon, CheckIcon, EyeIcon, LockIcon, PhoneIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble } from '../src/core/privacy';
import { getSource, phoneOnly, setSource, type Source } from '../src/core/source';
import { phoneCanWrite, type PhoneCanWrite } from '../src/core/phoneStatus';
import { NAME, nothing, session, type GptState } from '../src/chatgpt/session';
import { appsLine } from './index';
import Native from '../modules/ownvoice-native';

/** How Ownvoice writes: this phone or the person's ChatGPT, as two cards. The chosen card says how it
 *  is doing and what can be changed; switching to ChatGPT asks first (or signs in right here), switching
 *  back to the phone is immediate. `start=chatgpt` (from Home's card) begins that switch on arrival. */
export default function SourceScreen() {
  const t = useTheme();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const [source, setShown] = useState<Source | undefined>(undefined);
  const [phone, setPhone] = useState<PhoneCanWrite | null>(null);
  const [gpt, setGpt] = useState<GptState | null>(null);
  // The ChatGPT sign-in, shown inside its card: null unless the person is signing in here.
  const [signIn, setSignIn] = useState<GptState | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [stays, setStays] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const attempt = useRef(0);
  const started = useRef(false);
  const live = useRef(true);
  const latest = useRef(signIn);
  latest.current = signIn;

  const choose = (next: Source) => {
    try { setSource(next); setShown(next); setProblem(null); } catch { setProblem(words.gptAppsSaveFailed); }
  };

  const reload = useCallback(() => {
    void getSource().then(now => { if (live.current) setShown(now); }).catch(() => { if (live.current) setShown(null); });
    void phoneCanWrite().then(can => { if (live.current) setPhone(can); });
    void session.current().then(now => { if (live.current) setGpt(now); }).catch(() => { if (live.current) setGpt(nothing); });
    void Promise.all([Native.launcherApps(null), Native.bubbleRules()]).then(([apps, rules]) => {
      const listed = phoneOnly();
      if (live.current) setStays(appsLine(apps.filter(({ app }) => listed.includes(app) && showsBubble(app, rules)).map(({ label }) => label)));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      // Leaving mid sign-in keeps nothing: the waiting code is dropped.
      attempt.current++;
      if (latest.current?.waiting) void session.cancel().catch(() => {});
    };
  }, []);
  useFocusEffect(reload);

  /** Answers from a sign-in the person has since left are dropped. */
  const shown = (at: number, next: GptState) => {
    if (!live.current || at !== attempt.current) return;
    if (next.signedIn) { setSignIn(null); setGpt(next); choose('chatgpt'); } else setSignIn(next);
  };

  const beginSignIn = () => {
    const at = ++attempt.current;
    setProblem(null);
    setSignIn({ ...nothing, waiting: true });
    void session.start()
      .then(async next => { if (at !== attempt.current) await session.cancel(); return next; })
      .then(next => shown(at, next))
      .catch(() => shown(at, { ...nothing, note: words.failed }));
  };

  const leaveSignIn = () => {
    attempt.current++;
    if (signIn?.waiting) void session.cancel().catch(() => {});
    setSignIn(null);
  };

  // The approval happens on the ChatGPT page, so the card looks again while a code waits.
  useEffect(() => {
    if (!signIn?.waiting) return;
    const at = attempt.current;
    const id = setInterval(() => { void session.current().then(next => shown(at, next)).catch(() => {}); }, 1000);
    return () => clearInterval(id);
  }, [signIn?.waiting]);

  /** ChatGPT picked: ask first when already signed in, otherwise sign in right here. */
  const pickChatGpt = () => {
    if (source === 'chatgpt' || signIn) return;
    if (gpt?.signedIn) setConfirm(true); else beginSignIn();
  };

  /** This phone picked: the private direction, so no question. ChatGPT stays signed in until Sign out. */
  const pickPhone = () => {
    if (signIn) leaveSignIn();
    if (source !== 'phone') choose('phone');
  };

  useEffect(() => {
    if (start !== 'chatgpt' || started.current || source === undefined || !gpt || source === 'chatgpt') return;
    started.current = true;
    pickChatGpt();
  }, [start, source, gpt]);

  const signOut = () => {
    setProblem(null);
    void session.signOut().then(next => {
      if (!live.current) return;
      setGpt(next);
      // Signed out while ChatGPT wrote: this phone takes over where it can, otherwise nothing is chosen.
      if (source === 'chatgpt') choose(phone === 'cant' ? null : 'phone');
    }).catch(() => { if (live.current) setProblem(words.gptSignOutFailed); });
  };

  const copyAndOpen = () => {
    if (!signIn?.code) return;
    void Native.copy(signIn.code).catch(() => {});
    if (signIn.url) void Linking.openURL(signIn.url).catch(() => { if (live.current) setSignIn(current => current && { ...current, note: words.gptPageFailed }); });
  };

  const phoneCan = phone !== null && phone !== 'cant';
  const icon = (Icon: typeof ChatIcon) => <Icon size={22} color={t.onPrimaryContainer} />;
  const indent = (text: string, color = t.text) => <Text style={[type.note, styles.indent, { color }]}>{text}</Text>;
  const resting = !!gpt?.resting;

  const gptBody = signIn
    ? signIn.waiting
      ? <>
        {indent(words.signInNote, t.muted)}
        <View style={[styles.code, { backgroundColor: t.group }]}>
          {signIn.code && <>
            <Text style={[type.label, { color: t.muted, textAlign: 'center' }]}>{words.yourCode}</Text>
            <Text testID="sign-in-code" accessibilityLabel={`${words.yourCode} ${signIn.code.split('').join(' ')}`} style={[type.headline, styles.codeText, { color: t.text }]}>{signIn.code}</Text>
          </>}
          <View style={styles.waiting}>
            <ActivityIndicator size="small" color={t.primary} />
            <Text style={[type.note, { color: t.muted }]}>{signIn.code ? words.waiting : signIn.note ?? words.waiting}</Text>
          </View>
        </View>
        <Button kind="filled" disabled={!signIn.code} label={words.copyAndOpen} onPress={copyAndOpen} />
        <Button kind="text" label={words.gptCancel} onPress={leaveSignIn} />
        <Text style={[type.note, { color: t.muted }]}>{say('terms.grey', { name: NAME, company: 'OpenAI' })}</Text>
      </>
      : <>
        {indent(signIn.note ?? words.failed)}
        <View style={styles.actions}>
          <Button kind="filled" label={words.tryAgain} onPress={beginSignIn} />
          <Button kind="text" label={words.gptCancel} onPress={leaveSignIn} />
        </View>
      </>
    : source === 'chatgpt'
      ? <>
        {gpt?.signedIn
          ? <View style={styles.status}>
            {!resting && <CheckIcon size={18} color={t.primary} />}
            <Text style={[type.note, styles.words, { color: t.text }]}>{gpt.note ?? words.gptSignedInNow}</Text>
          </View>
          : <>
            {indent(say('status.needsAgain', { name: NAME }))}
            <View style={styles.indent}><Button kind="filled" label={words.gptButton} onPress={beginSignIn} /></View>
          </>}
        {phoneCan && indent(resting || !gpt?.signedIn ? words.restingPhone : words.phoneBackup, t.muted)}
        <View style={[styles.inner, { backgroundColor: t.group }]}>
          <Row title={words.phoneOnlyApps} subtitle={stays ?? undefined} onPress={() => router.push('/phone-apps')} />
          {gpt?.signedIn && <View style={styles.signOut}><Button kind="text" label={words.gptSignOut} onPress={signOut} /></View>}
        </View>
      </>
      : null;

  const notes = [
    [LockIcon, source === 'chatgpt' ? words.privacyGpt : words.privacyPhone],
    ...(source === 'chatgpt' ? [[ChatIcon, words.switchNote] as const] : []),
    [EyeIcon, words.readsNote],
  ] as const;

  return <View style={{ flex: 1 }}>
    <Page title={words.rowSource} note={words.sourceNote} onBack={() => router.back()}>
      {source !== undefined && phone !== null && <View style={styles.options} accessibilityRole="radiogroup">
        {phone === 'cant'
          ? <SourceOption icon={icon(PhoneIcon)} title={words.srcPhone} subtitle={words.srcPhoneCant} selected={false} unavailable />
          : <SourceOption icon={icon(PhoneIcon)} title={words.srcPhone} subtitle={words.srcPhoneSub} selected={source === 'phone' && !signIn} onPress={pickPhone}>
            {source === 'phone' && !signIn ? <PhoneWriter /> : null}
          </SourceOption>}
        <SourceOption icon={icon(ChatIcon)} title={words.srcGpt} subtitle={words.srcGptSub} selected={source === 'chatgpt' || !!signIn} onPress={pickChatGpt}>
          {gptBody}
        </SourceOption>
      </View>}
      {problem && <Text style={[type.body, { color: t.text }]}>{problem}</Text>}
      <Text accessibilityRole="header" style={[type.label, styles.section, { color: t.primary }]}>{words.writingSection}</Text>
      {notes.map(([Icon, text]) => <View key={text} style={[styles.card, { backgroundColor: t.group }]}>
        <Badge>{icon(Icon)}</Badge>
        <Text style={[type.body, { color: t.text, flex: 1 }]}>{text}</Text>
      </View>)}
    </Page>
    {confirm && <View style={StyleSheet.absoluteFill}>
      <Sheet title={words.switchTitle} mood="listening" onClose={() => setConfirm(false)}>
        <View style={styles.sheet}>
          <Text style={[type.body, { color: t.text }]}>{words.switchBody}</Text>
          <Text style={[type.note, { color: t.muted }]}>{say('terms.grey', { name: NAME, company: 'OpenAI' })}</Text>
          <View style={styles.sheetActions}>
            <Button kind="filled" large label={words.switchYes} onPress={() => { choose('chatgpt'); setConfirm(false); }} />
            <Button kind="text" label={source === 'phone' ? words.switchNo : words.cancel} onPress={() => setConfirm(false)} />
          </View>
        </View>
      </Sheet>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  options: { gap: space.m },
  // Lines up with the option's name, past its icon.
  indent: { paddingLeft: 56 },
  words: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 56 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, paddingLeft: 56 },
  inner: { borderRadius: shape.group, overflow: 'hidden', paddingVertical: space.xs },
  signOut: { alignItems: 'flex-start', paddingHorizontal: space.xs, paddingBottom: space.s },
  code: { borderRadius: shape.group, padding: space.l, gap: space.xs },
  codeText: { letterSpacing: 4, textAlign: 'center', paddingVertical: space.m },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: space.s },
  section: { marginTop: space.l, paddingHorizontal: space.s },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l, borderRadius: shape.group, padding: space.l },
  sheet: { gap: space.m, paddingHorizontal: space.s, paddingTop: space.s },
  sheetActions: { gap: space.xs, marginTop: space.s },
});
