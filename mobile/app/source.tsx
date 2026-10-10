import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { say } from '@byokit/accounts';
import { Badge } from '../src/ui/Badge';
import { Button } from '../src/ui/Button';
import { ClaudeSignIn } from '../src/ui/ClaudeSignIn';
import { Page } from '../src/ui/Page';
import { PhoneWriter } from '../src/ui/PhoneWriter';
import { Row } from '../src/ui/Row';
import { Sheet } from '../src/ui/Sheet';
import { SourceOption } from '../src/ui/SourceOption';
import { ChatIcon, CheckIcon, ChevIcon, EyeIcon, LockIcon, PhoneIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble } from '../src/core/privacy';
import { cloudSession, getSource, phoneOnly, setSource, type CloudKey, type Source } from '../src/core/source';
import { phoneCanWrite, type PhoneCanWrite } from '../src/core/phoneStatus';
import { CLAUDE_NAME, NAME, nothing, type GptState } from '../src/chatgpt/session';
import { appsLine } from './index';
import Native from '../modules/ownvoice-native';

/** How Ownvoice writes: this phone, or one of the person's cloud accounts (ChatGPT, Claude), as cards.
 *  The chosen card says how it is doing and what can be changed; switching to an account asks first (or
 *  signs in right here), switching back to the phone is immediate. `start=chatgpt|claude` (from Home's
 *  card) begins that switch on arrival. */
const ACCOUNT_COPY: Record<CloudKey, { title: string; body: string; name: string; company: string; yes: string; button: string; signOut: string; phoneBackup: string; ready: string }> = {
  chatgpt: { title: words.switchTitle, body: words.switchBody, name: NAME, company: 'OpenAI', yes: words.switchYes, button: words.gptButton, signOut: words.gptSignOut, phoneBackup: words.phoneBackup, ready: words.gptSignedInNow },
  claude: { title: words.claudeSwitchTitle, body: words.claudeSwitchBody, name: CLAUDE_NAME, company: 'Anthropic', yes: words.claudeSwitchYes, button: words.claudeButton, signOut: words.claudeSignOut, phoneBackup: words.claudePhoneBackup, ready: say('status.ready', { name: CLAUDE_NAME }) },
};

export default function SourceScreen() {
  const t = useTheme();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const [source, setShown] = useState<Source | undefined>(undefined);
  const [phone, setPhone] = useState<PhoneCanWrite | null>(null);
  const [gpt, setGpt] = useState<GptState | null>(null);
  const [claude, setClaude] = useState<GptState | null>(null);
  // An account's sign-in, shown inside its card: null unless the person is signing in here.
  const [signIn, setSignIn] = useState<{ key: CloudKey; state: GptState } | null>(null);
  const [confirm, setConfirm] = useState<CloudKey | null>(null);
  const [stays, setStays] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const attempt = useRef(0);
  const started = useRef(false);
  const live = useRef(true);
  const latest = useRef(signIn);
  latest.current = signIn;
  const setState = (key: CloudKey, next: GptState) => (key === 'claude' ? setClaude : setGpt)(next);

  const choose = (next: Source) => {
    try { setSource(next); setShown(next); setProblem(null); } catch { setProblem(words.gptAppsSaveFailed); }
  };

  const reload = useCallback(() => {
    void getSource().then(now => { if (live.current) setShown(now); }).catch(() => { if (live.current) setShown(null); });
    void phoneCanWrite().then(can => { if (live.current) setPhone(can); });
    void cloudSession('chatgpt').current().then(now => { if (live.current) setGpt(now); }).catch(() => { if (live.current) setGpt(nothing); });
    void cloudSession('claude').current().then(now => { if (live.current) setClaude(now); }).catch(() => { if (live.current) setClaude(nothing); });
    void Promise.all([Native.launcherApps(null), Native.bubbleRules()]).then(([apps, rules]) => {
      const listed = phoneOnly();
      if (live.current) setStays(apps.filter(({ app }) => listed.includes(app) && showsBubble(app, rules)).map(({ label }) => label));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      // Leaving mid sign-in keeps nothing: the waiting code is dropped.
      attempt.current++;
      if (latest.current?.state.waiting) void cloudSession(latest.current.key).cancel().catch(() => {});
    };
  }, []);
  useFocusEffect(reload);

  /** Answers from a sign-in the person has since left are dropped. */
  const shown = (key: CloudKey, at: number, next: GptState) => {
    if (!live.current || at !== attempt.current) return;
    if (next.signedIn) { setSignIn(null); setState(key, next); choose(key); } else setSignIn({ key, state: next });
  };

  const beginSignIn = (key: CloudKey) => {
    const at = ++attempt.current;
    const s = cloudSession(key);
    setProblem(null);
    setSignIn({ key, state: { ...nothing, waiting: true } });
    void s.start()
      // Left while the code was being made: drop it, unless a newer sign-in is already waiting (that one is the same session's).
      .then(async next => { if (at !== attempt.current && (!live.current || !latest.current)) await s.cancel(); return next; })
      .then(next => shown(key, at, next))
      .catch(() => shown(key, at, { ...nothing, note: words.failed }));
  };

  /** The code the Claude page shows, handed back through the kit's own paste seam. */
  const connectClaude = (text: string) => {
    if (signIn?.key !== 'claude') return false;
    try { require('../src/chatgpt/accounts').paste('claude', text); return true; } catch { setProblem(words.claudePasteFailed); return false; }
  };

  const leaveSignIn = () => {
    attempt.current++;
    if (signIn?.state.waiting) void cloudSession(signIn.key).cancel().catch(() => {});
    setSignIn(null);
  };

  // The approval happens on the provider's own page, so the card looks again while it waits.
  useEffect(() => {
    if (!signIn?.state.waiting) return;
    const key = signIn.key;
    const at = attempt.current;
    const id = setInterval(() => { void cloudSession(key).current().then(next => shown(key, at, next)).catch(() => {}); }, 1000);
    return () => clearInterval(id);
  }, [signIn?.state.waiting, signIn?.key]);

  /** An account picked: ask first when already signed in, otherwise sign in right here. */
  const pickCloud = (key: CloudKey) => {
    if (source === key || signIn) return;
    if ((key === 'claude' ? claude : gpt)?.signedIn) setConfirm(key); else beginSignIn(key);
  };
  const pickChatGpt = () => pickCloud('chatgpt');
  const pickClaude = () => pickCloud('claude');

  /** This phone picked: the private direction, so no question. A signed-in account stays signed in until Sign out. */
  const pickPhone = () => {
    if (signIn) leaveSignIn();
    if (source !== 'phone') choose('phone');
  };

  useEffect(() => {
    const key = start === 'claude' || start === 'chatgpt' ? start : null;
    if (!key || started.current || source === undefined || !(key === 'claude' ? claude : gpt) || source === key) return;
    started.current = true;
    pickCloud(key);
  }, [start, source, gpt, claude]);

  const signOut = (key: CloudKey) => {
    setProblem(null);
    void cloudSession(key).signOut().then(async next => {
      // Signed out while that account wrote: this phone takes over where it can, otherwise nothing is chosen.
      const can = await phoneCanWrite();
      if (!live.current) return;
      setState(key, next);
      setPhone(can);
      if (source === key) choose(can === 'cant' ? null : 'phone');
    }).catch(() => { if (live.current) setProblem(words.gptSignOutFailed); });
  };

  const copyAndOpen = () => {
    if (signIn?.key !== 'chatgpt' || !signIn.state.code) return;
    void Native.copy(signIn.state.code).catch(() => {});
    if (signIn.state.url) void Linking.openURL(signIn.state.url).catch(() => { if (live.current) setSignIn(current => current && current.key === 'chatgpt' ? { ...current, state: { ...current.state, note: words.gptPageFailed } } : current); });
  };

  const openClaude = () => {
    if (signIn?.key !== 'claude' || !signIn.state.url) return;
    void Linking.openURL(signIn.state.url).catch(() => { if (live.current) setSignIn(current => current && current.key === 'claude' ? { ...current, state: { ...current.state, note: words.claudePageFailed } } : current); });
  };

  const phoneCan = phone !== null && phone !== 'cant';
  // A phone that was chosen but can no longer write reads as not chosen (Home resets the stored choice).
  const chosen = source === 'phone' && phone === 'cant' ? null : source;
  const icon = (Icon: typeof ChatIcon) => <Icon size={22} color={t.onPrimaryContainer} />;
  const indent = (text: string, color = t.text) => <Text style={[type.note, styles.indent, { color }]}>{text}</Text>;
  /** One account's card body: its sign-in while it runs, otherwise how the account is doing when chosen. Claude signs in on its own page: open it already signed in, then paste the code it shows back here. */
  const body = (key: CloudKey) => {
    const copy = ACCOUNT_COPY[key];
    const cloud = key === 'claude' ? claude : gpt;
    const resting = !!cloud?.resting;
    const signing = signIn?.key === key ? signIn.state : null;
    if (signing?.waiting) return <>
      {indent(key === 'claude' ? signing.note ?? words.claudeSignInNote : words.signInNote, t.muted)}
      {key === 'claude'
        ? <ClaudeSignIn url={signing.url ?? null} onOpen={openClaude} onConnect={connectClaude} />
        : <>
          <View style={[styles.code, { backgroundColor: t.group }]}>
            {signing.code && <>
              <Text style={[type.label, { color: t.muted, textAlign: 'center' }]}>{words.yourCode}</Text>
              <Text testID="sign-in-code" accessibilityLabel={`${words.yourCode} ${signing.code.split('').join(' ')}`} style={[type.headline, styles.codeText, { color: t.text }]}>{signing.code}</Text>
            </>}
            <View style={styles.waiting}>
              <ActivityIndicator size="small" color={t.primary} />
              <Text style={[type.note, { color: t.muted }]}>{signing.code ? words.waiting : signing.note ?? words.waiting}</Text>
            </View>
          </View>
          <Button kind="filled" disabled={!signing.code} label={words.copyAndOpen} onPress={copyAndOpen} />
        </>}
      <Button kind="text" label={words.gptCancel} onPress={leaveSignIn} />
      <Text style={[type.note, styles.indent, { color: t.muted }]}>{say('terms.grey', { name: copy.name, company: copy.company })}</Text>
    </>;
    if (signing) return <>
      {indent(signing.note ?? words.failed)}
      <View style={styles.actions}>
        <Button kind="filled" label={words.tryAgain} onPress={() => beginSignIn(key)} />
        <Button kind="text" label={words.gptCancel} onPress={leaveSignIn} />
      </View>
    </>;
    if (source !== key) return null;
    return <>
      {cloud?.signedIn
        ? <View style={styles.status}>
          {!resting && <CheckIcon size={18} color={t.primary} />}
          <Text style={[type.note, styles.words, { color: t.text }]}>{cloud.note ?? copy.ready}</Text>
        </View>
        : <>
          {indent(say('status.needsAgain', { name: copy.name }))}
          <View style={styles.indent}><Button kind="filled" label={copy.button} onPress={() => beginSignIn(key)} /></View>
        </>}
      {phoneCan && indent(resting || !cloud?.signedIn ? words.restingPhone : copy.phoneBackup, t.muted)}
      {key === 'chatgpt'
        ? <View style={[styles.inner, { backgroundColor: t.group }]}>
          <Row title={words.phoneOnlyApps} subtitle={stays ? appsLine(stays) : undefined} onPress={() => router.push('/phone-apps')} />
          {cloud?.signedIn && <View style={styles.signOut}><Button kind="text" label={copy.signOut} onPress={() => signOut(key)} /></View>}
        </View>
        : cloud?.signedIn && <View style={styles.signOut}><Button kind="text" label={copy.signOut} onPress={() => signOut(key)} /></View>}
    </>;
  };

  // What happens to the writing, for the chosen option only: nothing chosen means nothing is written or sent.
  // Each reads as a short headline first, with the full sentence under it; the read log opens its own screen.
  const notes: [typeof LockIcon, string, string, (() => void)?][] = [
    ...(chosen === 'chatgpt' ? [[LockIcon, words.headGpt, words.privacyGpt], [ChatIcon, words.headSwitch, words.switchNote]] as [typeof LockIcon, string, string][]
      : chosen === 'claude' ? [[LockIcon, words.headClaude, words.privacyClaude], [ChatIcon, words.headSwitch, words.switchNoteClaude]] as [typeof LockIcon, string, string][]
      : chosen === 'phone' ? [[LockIcon, words.headPhone, words.privacyPhone]] as [typeof LockIcon, string, string][] : []),
    [EyeIcon, words.headReads, words.readsNote, () => router.push('/reads')],
  ];

  return <View style={{ flex: 1 }}>
    <Page title={words.rowSource} note={words.sourceNote} stickyTop onBack={() => router.back()}>
      {source !== undefined && phone !== null && <View style={styles.options} accessibilityRole="radiogroup">
        {phone === 'cant'
          ? <SourceOption icon={icon(PhoneIcon)} title={words.srcPhone} subtitle={words.srcPhoneCant} selected={false} unavailable
            reason={<>
              <Text style={[type.note, styles.indent, { color: t.text }]}>{chosen === 'claude' ? words.claudePhoneCantWhy : words.phoneCantWhy}</Text>
              {chosen !== 'chatgpt' && chosen !== 'claude' && !signIn && <View style={styles.indent}><Button kind="filled" label={words.gptButton} onPress={pickChatGpt} /></View>}
            </>} />
          : <SourceOption icon={icon(PhoneIcon)} title={words.srcPhone} subtitle={words.srcPhoneSub} selected={source === 'phone' && !signIn} onPress={pickPhone}>
            {source === 'phone' && !signIn ? <PhoneWriter /> : null}
          </SourceOption>}
        <SourceOption icon={icon(ChatIcon)} title={words.srcGpt} subtitle={words.srcGptSub} selected={source === 'chatgpt' || signIn?.key === 'chatgpt'} onPress={pickChatGpt}>
          {body('chatgpt')}
        </SourceOption>
        <SourceOption icon={icon(ChatIcon)} title={words.srcClaude} subtitle={words.srcGptSub} selected={source === 'claude' || signIn?.key === 'claude'} onPress={pickClaude}>
          {body('claude')}
        </SourceOption>
      </View>}
      {problem && <Text style={[type.body, { color: t.text }]}>{problem}</Text>}
      <Text accessibilityRole="header" style={[type.label, styles.section, { color: t.primary }]}>{words.writingSection}</Text>
      <View style={[styles.notes, { backgroundColor: t.group }]}>
        {notes.map(([Icon, head, text, open], i) => {
          const inner = <>
            <Badge>{icon(Icon)}</Badge>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: t.text, fontWeight: '600' }]}>{head}</Text>
              <Text style={[type.note, { color: t.muted, marginTop: 2 }]}>{text}</Text>
            </View>
            {open ? <ChevIcon size={24} color={t.muted} /> : null}
          </>;
          const line = i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null;
          return open
            ? <Pressable key={head} accessibilityRole="button" onPress={open} android_ripple={{ color: t.text + '12', foreground: true }} style={[styles.card, line]}>{inner}</Pressable>
            : <View key={head} style={[styles.card, line]}>{inner}</View>;
        })}
      </View>
    </Page>
    {confirm && <View style={StyleSheet.absoluteFill}>
      <Sheet title={ACCOUNT_COPY[confirm].title} mood="listening" onClose={() => setConfirm(null)}>
        <View style={styles.sheet}>
          <Text style={[type.body, { color: t.text }]}>{ACCOUNT_COPY[confirm].body}</Text>
          <Text style={[type.note, { color: t.muted }]}>{say('terms.grey', { name: ACCOUNT_COPY[confirm].name, company: ACCOUNT_COPY[confirm].company })}</Text>
          <View style={styles.sheetActions}>
            <Button kind="filled" large label={ACCOUNT_COPY[confirm].yes} onPress={() => { choose(confirm); setConfirm(null); }} />
            <Button kind="text" label={chosen === 'phone' ? words.switchNo : words.cancel} onPress={() => setConfirm(null)} />
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
  // The text button's own padding lines its label up with the row's title above.
  signOut: { alignItems: 'flex-start', marginLeft: space.l - 24, paddingBottom: space.s },
  code: { borderRadius: shape.group, padding: space.l, gap: space.xs },
  codeText: { letterSpacing: 4, textAlign: 'center', paddingVertical: space.m },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: space.s },
  section: { marginTop: space.l, paddingHorizontal: space.s },
  notes: { borderRadius: shape.group, overflow: 'hidden' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l, padding: space.l },
  sheet: { gap: space.m, paddingHorizontal: space.s, paddingTop: space.s },
  sheetActions: { gap: space.xs, marginTop: space.s },
});
