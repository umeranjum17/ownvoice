import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { say, type OpenCodeGoWorkspace } from '@byokit/accounts';
import type { ConnectGroup, ConnectRow } from '@byokit/ui/connect';
import { Badge } from '../src/ui/Badge';
import { Button } from '../src/ui/Button';
import { ChatGptPage } from '../src/ui/ChatGptPage';
import { ClaudeSignIn } from '../src/ui/ClaudeSignIn';
import { ConnectList } from '../src/ui/ConnectList';
import { KeyConnect } from '../src/ui/KeyConnect';
import { Page } from '../src/ui/Page';
import { PhoneWriter } from '../src/ui/PhoneWriter';
import { Row } from '../src/ui/Row';
import { Sheet } from '../src/ui/Sheet';
import { SourceOption } from '../src/ui/SourceOption';
import { ChatIcon, CheckIcon, ChevIcon, EyeIcon, LockIcon, PhoneIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble } from '../src/core/privacy';
import { pickedModel } from '../src/core/model';
import { cloudSession, getSource, phoneOnly, setSource, type CloudKey, type Source } from '../src/core/source';
import { phoneCanWrite, type PhoneCanWrite } from '../src/core/phoneStatus';
import { cardOf, companyOf, hasOwnScreen, isKeyCard, nameOf, readyOnPhone } from '../src/chatgpt/cards';
import { cardOfRow, connectGroups, usable } from '../src/chatgpt/connect';
import { genericWords } from '../src/core/accountWords';
import { asksModel, nothing, termsOf, type GptState } from '../src/chatgpt/session';
import { appsLine } from './index';
import Native from '../modules/ownvoice-native';

/** How Ownvoice writes: this phone, or any account or key the kit lists, as cards: the kit's own list, grouped by how
 *  the person pays, with nothing picked until they tap one. The chosen card says how it is doing and what can be
 *  changed; switching to an account asks first (or signs in right here), switching back to the phone is immediate.
 *  `start=<card>` (from Home's card: chatgpt, claude, openrouter, opencode, or a kit route id) begins that switch on arrival. */
type Copy = { title: string; body: string; name: string; company: string; yes: string; button: string; signOut: string; phoneBackup: string; ready: string };
// The first four keep their shipped words; every other route is worded by its name (core/accountWords).
const LEGACY_COPY: Record<string, Copy> = {
  chatgpt: { title: words.switchTitle, body: words.switchBody, name: nameOf('chatgpt'), company: companyOf('chatgpt'), yes: words.switchYes, button: words.gptButton, signOut: words.gptSignOut, phoneBackup: words.phoneBackup, ready: words.gptSignedInNow },
  claude: { title: words.claudeSwitchTitle, body: words.claudeSwitchBody, name: nameOf('claude'), company: companyOf('claude'), yes: words.claudeSwitchYes, button: words.claudeButton, signOut: words.claudeSignOut, phoneBackup: words.claudePhoneBackup, ready: say('status.ready', { name: nameOf('claude') }) },
  openrouter: { title: words.openrouterSwitchTitle, body: words.openrouterSwitchBody, name: nameOf('openrouter'), company: companyOf('openrouter'), yes: words.openrouterSwitchYes, button: words.openrouterButton, signOut: words.openrouterSignOut, phoneBackup: words.openrouterPhoneBackup, ready: say('status.ready', { name: nameOf('openrouter') }) },
  opencode: { title: words.openCodeSwitchTitle, body: words.openCodeSwitchBody, name: nameOf('opencode'), company: companyOf('opencode'), yes: words.openCodeSwitchYes, button: words.openCodeButton, signOut: words.openCodeSignOut, phoneBackup: words.openCodePhoneBackup, ready: say('status.ready', { name: nameOf('opencode') }) },
};
const copyOf = (key: CloudKey): Copy => {
  const g = genericWords(key);
  return g ? { title: g.switchTitle, body: g.switchBody, name: g.name, company: companyOf(key), yes: g.switchYes, button: g.button, signOut: g.signOut, phoneBackup: g.phoneBackup, ready: say('status.ready', { name: g.name }) } : LEGACY_COPY[key] ?? LEGACY_COPY.chatgpt;
};

export default function SourceScreen() {
  const t = useTheme();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const [source, setShown] = useState<Source | undefined>(undefined);
  const [phone, setPhone] = useState<PhoneCanWrite | null>(null);
  // How each account is doing, read when a card is chosen or tapped (any route the kit lists can be a card).
  const [states, setStates] = useState<Record<CloudKey, GptState>>({});
  const groups = useMemo<ConnectGroup[]>(() => { try { return connectGroups(); } catch { return []; } }, []);
  // An account's sign-in, shown inside its card: null unless the person is signing in here.
  const [signIn, setSignIn] = useState<{ key: CloudKey; state: GptState } | null>(null);
  const [confirm, setConfirm] = useState<CloudKey | null>(null);
  const [stays, setStays] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // An OpenCode Go key that works with several workspaces: the kit's list to pick from, and the pasted
  // key held only in memory until the pick connects it.
  const [workspaces, setWorkspaces] = useState<OpenCodeGoWorkspace[] | null>(null);
  const goKey = useRef('');
  const [picking, setPicking] = useState(false);
  // The pick screen saves to the store; looking again on focus shows what was chosen.
  const [, again] = useState(0);
  const attempt = useRef(0);
  const started = useRef(false);
  const live = useRef(true);
  const latest = useRef(signIn);
  latest.current = signIn;
  const setState = (key: CloudKey, next: GptState) => setStates(now => ({ ...now, [key]: next }));

  const choose = (next: Source) => {
    try { setSource(next); setShown(next); setProblem(null); } catch { setProblem(words.gptAppsSaveFailed); }
  };

  const reload = useCallback(() => {
    again(n => n + 1);
    void getSource().then(now => {
      if (!live.current) return;
      setShown(now);
      // Only the account that writes is read up front; the others are read when tapped.
      const writes = cardOf(now);
      if (writes) void cloudSession(writes).current().then(state => { if (live.current) setState(writes, state); }).catch(() => { if (live.current) setState(writes, nothing); });
    }).catch(() => { if (live.current) setShown(null); });
    void phoneCanWrite().then(can => { if (live.current) setPhone(can); });
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
    if (next.signedIn) { setSignIn(null); setState(key, next); choose(key); chooseModel(key); } else setSignIn({ key, state: next });
  };

  /** A signed-in account with no pick yet: ask which one writes, right away (never a choice made for the person). */
  const chooseModel = (key: CloudKey) => { if (asksModel(key) && !pickedModel(key)) router.push(`/model?account=${key}`); };

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

  /** The person's own OpenRouter key, handed to the kit's key route; a good key connects right here. */
  const connectOpenRouter = async (secret: string): Promise<boolean> => {
    if (signIn?.key !== 'openrouter') return false;
    try { await require('../src/chatgpt/accounts').connectOpenRouter(secret); }
    catch { if (live.current) setProblem(words.openrouterKeyFailed); return false; }
    const next = await cloudSession('openrouter').current().catch(() => nothing);
    if (live.current) shown('openrouter', attempt.current, next);
    return true;
  };

  /** The person's own OpenCode Go key, handed to the kit's plan key route; a good key connects right here,
   *  unless it works with several workspaces: then the kit's list shows and the picked one connects. */
  const connectOpenCode = async (secret: string, workspace?: string): Promise<boolean> => {
    if (signIn?.key !== 'opencode') return false;
    setProblem(null);
    let several: OpenCodeGoWorkspace[] | undefined;
    try { several = await require('../src/chatgpt/accounts').connectOpenCode(secret, workspace); }
    catch { if (live.current) setProblem(words.openCodeKeyFailed); return false; }
    if (several?.length) {
      goKey.current = secret;
      if (live.current) setWorkspaces(several);
      return true;
    }
    goKey.current = '';
    if (live.current) setWorkspaces(null);
    const next = await cloudSession('opencode').current().catch(() => nothing);
    if (live.current) shown('opencode', attempt.current, next);
    return true;
  };

  /** Any other key the kit lists (a plan's key or a per-use key), handed to the kit's route; a good key connects right here. */
  const connectGenericKey = async (secret: string): Promise<boolean> => {
    const key = signIn?.key;
    if (!key || hasOwnScreen(key)) return false;
    setProblem(null);
    try { await require('../src/chatgpt/accounts').connectKey(key, secret); }
    catch { if (live.current) setProblem(genericWords(key)?.keyFailed ?? words.openrouterKeyFailed); return false; }
    const next = await cloudSession(key).current().catch(() => nothing);
    if (live.current) shown(key, attempt.current, next);
    return true;
  };

  const leaveSignIn = () => {
    attempt.current++;
    goKey.current = '';
    setWorkspaces(null);
    if (signIn?.state.waiting) void cloudSession(signIn.key).cancel().catch(() => {});
    setSignIn(null);
  };

  // The approval happens on the provider's own page, so the card looks again while it waits.
  // OpenRouter has no page or code to poll: its form waits for the pasted key, not for the kit.
  useEffect(() => {
    if (!signIn?.state.waiting || isKeyCard(signIn.key)) return;
    const key = signIn.key;
    const at = attempt.current;
    const id = setInterval(() => { void cloudSession(key).current().then(next => shown(key, at, next)).catch(() => {}); }, 1000);
    return () => clearInterval(id);
  }, [signIn?.state.waiting, signIn?.key]);

  /** An account picked: ask first when already signed in, otherwise sign in right here. */
  const pickCloud = (key: CloudKey) => {
    if (source === key || signIn) return;
    const at = attempt.current;
    void (states[key] ? Promise.resolve(states[key]) : cloudSession(key).current().catch(() => nothing)).then(account => {
      // Dropped when the person left, or tapped something else, while the account was being read.
      if (!live.current || at !== attempt.current || latest.current) return;
      if (account.signedIn) { setState(key, account); setConfirm(key); } else beginSignIn(key);
    });
  };

  /** This phone picked: the private direction, so no question. A signed-in account stays signed in until Sign out. */
  const pickPhone = () => {
    if (signIn) leaveSignIn();
    if (source !== 'phone') choose('phone');
  };

  useEffect(() => {
    // `start` names a card (or a kit route id); one the kit doesn't run on this phone is ignored.
    const requested = cardOf(start);
    const key = requested && readyOnPhone(requested) ? requested : null;
    if (!key || started.current || source === undefined || source === key) return;
    started.current = true;
    pickCloud(key);
  }, [start, source]);

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
    const key = signIn?.key;
    // A code sign-in: ChatGPT's, or any other the kit runs by a code (Grok, Copilot, Kimi, MiniMax).
    if (!signIn || !key || key === 'claude' || isKeyCard(key) || !signIn.state.code) return;
    void Native.copy(signIn.state.code).catch(() => {});
    if (signIn.state.url) void Linking.openURL(signIn.state.url).catch(() => { if (live.current) setSignIn(current => current && current.key === key ? { ...current, state: { ...current.state, note: words.gptPageFailed } } : current); });
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
    const copy = copyOf(key);
    const cloud = states[key] ?? null;
    const resting = !!cloud?.resting;
    const signing = signIn?.key === key ? signIn.state : null;
    if (signing?.waiting) return <>
      {indent(key === 'claude' ? signing.note ?? words.claudeSignInNote : key === 'opencode' ? signing.note ?? words.openCodeKeyNote : key === 'openrouter' ? signing.note ?? words.openrouterKeyNote : isKeyCard(key) ? signing.note ?? genericWords(key)?.keyNote ?? words.signInNote : signing.url && !signing.code ? words.pageNote : words.signInNote, t.muted)}
      {key === 'claude'
        ? <ClaudeSignIn url={signing.url ?? null} onOpen={openClaude} onConnect={connectClaude} />
        : key === 'openrouter'
        ? <KeyConnect onConnect={connectOpenRouter} paste={words.openrouterPasteField} connect={words.openrouterConnect} testID="openrouter-paste" />
        : key === 'opencode' && workspaces
        ? <>
          {indent(say('connect.workspace'))}
          <View style={[styles.inner, { backgroundColor: t.group }]}>
            {workspaces.map(w => <Row key={w.id} title={w.name} disabled={picking} onPress={() => {
              setPicking(true);
              void connectOpenCode(goKey.current, w.id).finally(() => { if (live.current) setPicking(false); });
            }} />)}
          </View>
        </>
        : key === 'opencode'
        ? <KeyConnect onConnect={connectOpenCode} paste={words.openCodePasteField} connect={words.openCodeConnect} />
        : isKeyCard(key)
        ? <KeyConnect onConnect={connectGenericKey} paste={genericWords(key)?.pasteField ?? words.openrouterPasteField} connect={genericWords(key)?.connect ?? words.openrouterConnect} testID="route-key-paste" />
        : signing.url && !signing.code
        ? <ChatGptPage url={signing.url} />
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
      <Text style={[type.note, styles.indent, { color: t.muted }]}>{termsOf(key, copy.name, copy.company)}</Text>
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
      {cloud?.signedIn && asksModel(key) && <View style={[styles.inner, { backgroundColor: t.group }]}>
        <Row title={words.rowModel} subtitle={pickedModel(key) ? words.modelPicked : words.rowModelNone} onPress={() => router.push(`/model?account=${key}`)} />
      </View>}
      {key === 'chatgpt'
        ? <View style={[styles.inner, { backgroundColor: t.group }]}>
          <Row title={words.phoneOnlyApps} subtitle={stays ? appsLine(stays) : undefined} onPress={() => router.push('/phone-apps')} />
          {cloud?.signedIn && <View style={styles.signOut}><Button kind="text" label={copy.signOut} onPress={() => signOut(key)} /></View>}
        </View>
        : cloud?.signedIn && <View style={styles.signOut}><Button kind="text" label={copy.signOut} onPress={() => signOut(key)} /></View>}
    </>;
  };

  // What happens to the writing, for the chosen option only (or the account being connected right now, so the
  // card never says nothing leaves next to its sign-in): nothing chosen means nothing is written or sent.
  // Each reads as a short headline first, with the full sentence under it; the read log opens its own screen.
  const writer = signIn?.key ?? chosen;
  const writerName = writer ? writer && cardOf(writer) ? copyOf(writer).name : undefined : undefined;
  const notes: [typeof LockIcon, string, string, (() => void)?][] = [
    ...(writer === 'chatgpt' ? [[LockIcon, words.headGpt, words.privacyGpt], [ChatIcon, words.headSwitch, words.switchNote]] as [typeof LockIcon, string, string][]
      : writer === 'claude' ? [[LockIcon, words.headClaude, words.privacyClaude], [ChatIcon, words.headSwitch, words.switchNoteClaude]] as [typeof LockIcon, string, string][]
      : writer === 'openrouter' ? [[LockIcon, words.headOpenRouter, words.privacyOpenRouter], [ChatIcon, words.headSwitch, words.switchNoteOpenRouter]] as [typeof LockIcon, string, string][]
      : writer === 'opencode' ? [[LockIcon, words.headOpenCode, words.privacyOpenCode], [ChatIcon, words.headSwitch, words.switchNoteOpenCode]] as [typeof LockIcon, string, string][]
      : writer === 'phone' ? [[LockIcon, words.headPhone, words.privacyPhone]] as [typeof LockIcon, string, string][]
      : writer && genericWords(writer) ? [[LockIcon, genericWords(writer)!.head, genericWords(writer)!.privacy], [ChatIcon, words.headSwitch, genericWords(writer)!.switchNote]] as [typeof LockIcon, string, string][] : []),
    [EyeIcon, words.headReads, writerName ? words.readsNoteTo.replace('{name}', writerName) : words.readsNote, () => router.push('/reads')],
  ];

  return <View style={{ flex: 1 }}>
    <Page title={words.rowSource} note={words.sourceNote} stickyTop onBack={() => router.back()}>
      {source !== undefined && phone !== null && <View style={styles.options} accessibilityRole="radiogroup">
        {phone === 'cant'
          ? <SourceOption icon={icon(PhoneIcon)} title={words.srcPhone} subtitle={words.srcPhoneCant} selected={false} unavailable
            reason={<>
              <Text style={[type.note, styles.indent, { color: t.text }]}>{chosen === 'claude' ? words.claudePhoneCantWhy : chosen === 'openrouter' ? words.openrouterPhoneCantWhy : chosen === 'opencode' ? words.openCodePhoneCantWhy : genericWords(chosen)?.phoneCantWhy ?? words.phoneCantWhy}</Text>
            </>} />
          : <SourceOption icon={icon(PhoneIcon)} title={words.srcPhone} subtitle={words.srcPhoneSub} selected={source === 'phone' && !signIn} onPress={pickPhone}>
            {source === 'phone' && !signIn ? <PhoneWriter /> : null}
          </SourceOption>}
      </View>}
      {source !== undefined && phone !== null && <>
        <Text accessibilityRole="header" style={[type.label, styles.section, { color: t.primary }]}>{words.connectSection}</Text>
        <ConnectList groups={groups} picked={signIn?.key ?? (chosen && chosen !== 'phone' ? cardOf(chosen) : null)}
          onPick={row => { void pickCloud(cardOfRow(row)); }} body={row => body(cardOfRow(row))} />
      </>}
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
      <Sheet title={copyOf(confirm).title} mood="listening" onClose={() => setConfirm(null)}>
        <View style={styles.sheet}>
          <Text style={[type.body, { color: t.text }]}>{copyOf(confirm).body}</Text>
          <Text style={[type.note, { color: t.muted }]}>{say('terms.grey', { name: copyOf(confirm).name, company: copyOf(confirm).company })}</Text>
          <View style={styles.sheetActions}>
            <Button kind="filled" large label={copyOf(confirm).yes} onPress={() => { choose(confirm); chooseModel(confirm); setConfirm(null); }} />
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
