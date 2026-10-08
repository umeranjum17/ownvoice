import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { Progress } from '../src/ui/Progress';
import { Button } from '../src/ui/Button';
import { Badge } from '../src/ui/Badge';
import { Dot } from '../src/ui/Dot';
import { ChatIcon, CheckIcon, EyeIcon, GridIcon, HandIcon, LockIcon, PauseIcon, PenIcon, TrendIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble as bubbleInApp } from '../src/core/privacy';
import { answerOutcome, growthCounts, needsWeeklyCount, pendingCheckin, store, type CheckinAnswer, type Outcome } from '../src/core/store';
import { getSource, isOwnApp, phoneListed, setSource, storedSource, type Source } from '../src/core/source';
import { NAME, session, type GptState } from '../src/chatgpt/session';
import { say } from '@byokit/accounts';
import { agreed, downloading, getReady, modelStatus, resume, watch } from '../src/core/phoneDownload';
import { readLog, syncReadLog } from '../src/core/readLog';
import { loadVoice } from '../src/core/voiceStore';
import { saveBubbleRules } from '../src/chatgpt/settings';
import Native, { type ServiceState } from '../modules/ownvoice-native';
import type { InferState } from '@byokit/infer';

type Rules = { paused: boolean; on: string[]; off: string[] };
type App = { app: string; label: string; icon: string | null };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether the bubble shows in [app]: the user's own choice for it, or else the default list. */
export const showsBubble = (rules: Rules | null, app: string) =>
  !!rules && bubbleInApp(app, rules);

/** The apps the bubble shows in, as "WhatsApp, Gmail and 2 more" (MainActivity.appsLine). */
export function appsLine(labels: string[]): string {
  const n = labels.length;
  if (n === 0) return words.noApps;
  if (n === 1) return labels[0];
  if (n === 2) return `${labels[0]} and ${labels[1]}`;
  if (n === 3) return `${labels[0]}, ${labels[1]} and ${labels[2]}`;
  return `${labels[0]}, ${labels[1]} and ${n - 2} more`;
}

/** Home: whether Ownvoice is on and ready, then plain rows for where it works, your voice, what it read and pause. */
export default function Home() {
  const t = useTheme();
  const inset = useSafeAreaInsets().top;
  const [rules, setRules] = useState<Rules | null>(null);
  const [service, setService] = useState<ServiceState>('off');
  const [model, setModel] = useState<InferState | null>(null);
  const [fraction, setFraction] = useState(0);
  const [fetching, setFetching] = useState(downloading);
  const [apps, setApps] = useState<App[] | null>(null);
  const [phrases, setPhrases] = useState(0);
  const [week, setWeek] = useState(0);
  // A change that didn't save: what Try again repeats.
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [typing, setTyping] = useState<boolean | null>(null);
  const [source, setShownSource] = useState<Source | undefined>(storedSource);
  const [gpt, setGpt] = useState<GptState | null>(null);
  // Growth check-in (F6b): one quiet line per due insert, answered onto its own outcome record.
  const [checkin, setCheckin] = useState<Outcome | null>(null);
  const [weekly, setWeekly] = useState(false);
  const [hasCounts, setHasCounts] = useState(false);
  const [checkinFailed, setCheckinFailed] = useState(false);
  const busy = useRef(Promise.resolve());
  const readsBusy = useRef(Promise.resolve());

  const reload = useCallback(() => {
    void Native.serviceState().then(setService).catch(() => {});
    void modelStatus().then(setModel).catch(() => {});
    void Native.bubbleRules().then(setRules).catch(() => {});
    void Native.typingCheck().then(setTyping).catch(() => {});
    void getSource().then(setShownSource).catch(() => {});
    void session.current().then(setGpt).catch(() => {});
    void Native.launcherApps(null).then(setApps).catch(() => {});
    setPhrases(loadVoice().never.length);
    try {
      setCheckin(pendingCheckin());
      setWeekly(needsWeeklyCount());
      setHasCounts(growthCounts().length > 0);
    } catch {
      setCheckin(null);
      setWeekly(false);
      setHasCounts(false);
    }
    readsBusy.current = readsBusy.current.then(async () => {
      try {
        const reads = await syncReadLog().catch(() => readLog());
        setWeek(reads.filter(r => Date.now() - r.time < WEEK_MS).length);
      } catch {}
    });
  }, []);

  useEffect(() => {
    if (!store.get('setup-done')) { router.replace('/setup'); return; }
    const shown = AppState.addEventListener('change', state => { if (state === 'active') reload(); });
    const serviceChange = Native.addListener('onServiceChange', ({ state }) => setService(state));
    const modelProgress = watch(f => {
      setFetching(f != null);
      if (f == null) reload(); else setFraction(f);
    });
    // A download the person agreed to picks up where it stopped; settling reloads through the watcher above.
    void resume();
    return () => { shown.remove(); serviceChange.remove(); modelProgress(); };
  }, [reload]);

  useFocusEffect(useCallback(() => {
    if (store.get('setup-done')) reload();
  }, [reload]));

  // This phone was chosen but can't write any more (a new phone restored from a backup, a system
  // change): the choice goes back to not chosen, and nothing is sent anywhere until the person picks.
  useEffect(() => {
    if (source !== 'phone' || model?.phase !== 'unsupported' || process.env.EXPO_PUBLIC_E2E_STUB === '1') return;
    try { setSource(null); setShownSource(null); } catch {}
  }, [source, model]);

  // Callers fix the value they want at the tap, so Try again asks for the same value, never a second toggle.
  const changeRules = (update: (current: Rules) => Rules) => {
    busy.current = busy.current.then(async () => {
      const next = update(await Native.bubbleRules());
      await saveBubbleRules(next);
      setRules(next);
      setRetry(null);
    }).catch(() => setRetry(() => () => changeRules(update)));
  };
  // The switch is the phone's own: turning it on goes to the permission screen, off stops the service.
  const power = (want: boolean) => {
    setRetry(null);
    if (want) router.push('/setup');
    else { void Native.turnOff().then(reload).catch(() => { reload(); setRetry(() => () => power(false)); }); }
  };
  // Off unless the person switches it on: then the bubble counts slips after each typing pause, on this phone.
  const changeTyping = (on: boolean) => {
    setRetry(null);
    void Native.setTypingCheck(on).then(() => setTyping(on)).catch(() => setRetry(() => () => changeTyping(on)));
  };
  // The person's yes starts the one-time download (on Wi-Fi unless they pick mobile data).
  const start = (mobileData = false) => { void getReady(mobileData).catch(() => {}); };
  // A check-in answer is saved onto its own outcome record, on this phone; the line then goes quiet.
  const answer = (result: CheckinAnswer) => {
    if (!checkin) return;
    try { answerOutcome(checkin.id, result); }
    catch { setCheckinFailed(true); return; }
    setCheckinFailed(false);
    setCheckin(null);
    reload();
  };

  const paused = !!rules?.paused;
  const on = service === 'on';
  const yes = agreed();
  const phoneCan = model?.phase !== 'unsupported';
  // Nothing chosen: the card says so and offers the one way that works here, never a dead end.
  const needs = source === null;
  const viaGpt = source === 'chatgpt';
  const viaPhone = source === 'phone';
  // ChatGPT chosen but not writing right now: signed out, or resting (in byokit's own words).
  const gptLine = viaGpt && gpt ? (!gpt.signedIn ? say('status.needsAgain', { name: NAME }) : gpt.resting) : null;
  // Apps the bubble shows in that stay on this phone while ChatGPT writes: they need this phone's writer.
  const kept = viaGpt && !gptLine && !paused && rules && apps
    ? apps.filter(({ app }) => !isOwnApp(app) && showsBubble(rules, app) && phoneListed(app)).map(({ label }) => label) : [];
  const keptLine = kept.length ? words.cantWriteIn.replace('{apps}', appsLine(kept)) : null;
  const phoneNeeded = viaPhone || !!keptLine;
  const getting = phoneNeeded && (model?.phase === 'installing' || model?.phase === 'loading' || fetching);
  // Ask for the download only where this phone writes: picked, or kept for some apps under ChatGPT.
  const ask = phoneNeeded && (model?.phase === 'not-installed' || model?.phase === 'failed') && !yes && !getting;
  const stopped = phoneNeeded && (model?.phase === 'not-installed' || model?.phase === 'failed') && yes && !getting;
  const problem = stopped ? words.readyStopped : null;
  // No writer at all for those apps: this phone really can't write (the panel says phoneOnlyCant there). Unknown is not can't.
  const cantWrite = model?.phase === 'unsupported' ? keptLine : null;
  // Never ready from missing data: wait until the writer, its apps and this phone's answer are known.
  const checking = source === undefined || rules === null || viaPhone && model === null || viaGpt && (gpt === null || apps === null || model === null);
  const green = !needs && on && !paused && problem === null && !ask && !gptLine && !cantWrite && !checking;
  const headline = needs ? words.needWriter : !on ? words.statusOff : ask ? keptLine ?? words.readyTitle : problem ? words.statusNotReady : gptLine ?? (getting ? words.statusGettingReady : paused ? words.statusPaused : cantWrite ?? (checking ? words.statusChecking : words.statusReady));
  const detail = needs ? (phoneCan ? words.sourceNote : words.needWriterNote) : !on ? words.statusOffNote : ask ? (keptLine ? words.cantWriteReadyNote : words.readyNote) : problem
    ?? (gptLine ? (phoneCan ? words.restingPhone : null) : getting ? words.gettingReady : paused ? words.statusPausedNote : cantWrite ? words.cantWriteNote : checking ? null : words.statusReadyNote);
  const mood = needs ? 'check' : !on ? 'idle' : ask ? 'hello' : problem ? 'check' : gptLine ? (gpt?.signedIn ? 'idle' : 'check') : getting ? 'thinking' : paused ? 'idle' : cantWrite ? 'check' : checking ? 'idle' : 'ready';
  const signIn = needs && !phoneCan || on && viaGpt && !!gpt && !gpt.signedIn;
  const onCard = green ? t.onPrimaryContainer : t.text;
  const icon = (Icon: typeof GridIcon) => <Badge><Icon size={22} color={t.onPrimaryContainer} /></Badge>;
  const shown = (apps ?? []).filter(({ app }) => showsBubble(rules, app)).map(({ label }) => label);
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const, paddingVertical: space.xs };

  return <View style={{ flex: 1, backgroundColor: t.sheet, paddingTop: inset + space.xl }}><ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={styles.page}>
    <Text accessibilityRole="header" style={[type.display, { color: t.text }]}>{words.homeTitle}</Text>
    <Text style={[type.body, { color: t.muted, marginBottom: space.m }]}>{viaPhone ? words.homePhone : viaGpt ? words.homeGpt : words.welcomeNote}</Text>

    <View style={[styles.status, { backgroundColor: green ? t.primaryContainer : t.group }]}>
      <View style={styles.statusHead}>
        <View style={[styles.dot, !on && styles.resting]}><Dot mood={mood} size={64} /></View>
        <Switch accessibilityLabel={words.powerRow} value={on} onValueChange={power} />
      </View>
      <Text style={[type.heading, { color: onCard, marginTop: space.l }]}>{headline}</Text>
      {detail && <Text style={[type.body, { color: green ? t.onPrimaryContainer : t.muted, marginTop: space.xs }]}>{detail}</Text>}
      {on && getting && <View style={{ marginTop: space.l }}><Progress fraction={fraction} /></View>}
      {retry && <View style={{ paddingTop: space.m, gap: space.s, alignItems: 'flex-start' }}>
        <Text style={[type.body, { color: t.text }]}>{words.changeFailed}</Text>
        <Button kind="text" label={words.tryAgain} onPress={() => { const again = retry; setRetry(null); again(); }} />
      </View>}
      {(needs || signIn || on && (problem !== null || ask || !!cantWrite) || service !== 'on') && <View style={styles.statusActions}>
        {service === 'off' && !needs && !signIn && <Button kind="filled" label={words.turnOn} onPress={() => power(true)} />}
        {signIn && <Button kind="filled" label={words.gptButton} onPress={() => router.push('/source?start=chatgpt')} />}
        {needs && phoneCan && <Button kind="filled" label={words.continueLabel} onPress={() => router.push('/source')} />}
        {!needs && on && ask && <Button kind="filled" label={words.getReady} onPress={() => start()} />}
        {!needs && on && stopped && <Button kind="filled" label={words.tryAgain} onPress={() => start()} />}
        {!needs && on && stopped && <Button kind="text" label={words.useMobileData} onPress={() => start(true)} />}
        {!needs && on && (cantWrite || ask && keptLine) && <Button kind={cantWrite ? 'filled' : 'text'} label={words.cantWriteFix} onPress={() => router.push('/phone-apps')} />}
        {service === 'stuck' && <Button kind="filled" label={words.turnBackOn} onPress={() => router.push('/setup')} />}
      </View>}
    </View>

    {checkin && <View style={[styles.growth, { backgroundColor: t.group }]}>
      <Text style={[type.label, { color: t.text }]}>
        {checkin.platformLabel ? `How did your reply ${words.checkinOn} ${checkin.platformLabel} do?` : words.checkinAsk}
      </Text>
      {checkinFailed && <Text style={[type.note, { color: t.text }]}>{words.outcomeFailed}</Text>}
      <View style={styles.answers}>
        <View style={styles.answerCol}>
          <Button kind="outlined" label={words.checkinReplies} onPress={() => answer('replies')} />
          <Button kind="outlined" label={words.checkinQuiet} onPress={() => answer('nothing')} />
        </View>
        <View style={styles.answerCol}>
          <Button kind="outlined" label={words.checkinLikes} onPress={() => answer('likes')} />
          <Button kind="outlined" label={words.checkinSkipped} onPress={() => answer('not-posted')} />
        </View>
      </View>
    </View>}

    {weekly && <View style={[styles.growth, { backgroundColor: t.group }]}>
      <Text style={[type.label, { color: t.text }]}>{words.weeklyTitle}</Text>
      <Text style={[type.note, { color: t.muted }]}>{words.weeklyReminder}</Text>
      <Button kind="text" label={words.growthOpen} onPress={() => router.push('/growth')} />
    </View>}

    {!weekly && hasCounts && <View style={group}>
      <Row lead={icon(TrendIcon)} title={words.growthOpen} onPress={() => router.push('/growth')} />
    </View>}

    <View style={group}>
      <Row lead={icon(LockIcon)} title={words.rowSource} subtitle={viaPhone ? words.rowSourcePhone : viaGpt ? words.rowSourceGpt : words.rowSourceNone} onPress={() => router.push('/source')} />
      <Row lead={icon(GridIcon)} title={words.rowApps} subtitle={appsLine(shown)} onPress={() => router.push('/apps')} />
      <Row lead={icon(PenIcon)} title={words.rowVoice} subtitle={phrases === 0 ? words.noPhrases : phrases === 1 ? `1 ${words.phraseOne}` : `${phrases} ${words.phraseMany}`} onPress={() => router.push('/voice')} />
      <Row lead={icon(EyeIcon)} title={words.rowReads} subtitle={week === 0 ? words.nothingWeek : week === 1 ? words.onceWeek : `${week} ${words.timesWeek}`} onPress={() => router.push('/reads')} />
    </View>

    <View style={group}>
      <Row lead={icon(PauseIcon)} title={words.rowPause} subtitle={words.rowPauseNote}
        end={<View pointerEvents="none"><Switch value={paused} disabled={!rules} onValueChange={v => changeRules(r => ({ ...r, paused: v }))} /></View>}
        onPress={() => { if (rules) { const want = !rules.paused; changeRules(r => ({ ...r, paused: want })); } }} />
      <Row lead={icon(CheckIcon)} title={words.rowTyping} subtitle={words.rowTypingNote}
        end={<View pointerEvents="none"><Switch value={!!typing} disabled={typing === null} onValueChange={changeTyping} /></View>}
        onPress={() => { if (typing !== null) changeTyping(!typing); }} />
    </View>

    <View style={[styles.tip, { borderColor: t.line }]}>
      {icon(HandIcon)}
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { color: t.primary }]}>{words.tip}</Text>
        <Text style={[type.body, { color: t.text, fontWeight: '500' }]}>{words.rowRewrite}</Text>
        <Text style={[type.note, { color: t.muted }]}>{words.rowRewriteNote}</Text>
      </View>
    </View>

    {/* Lab builds only, the one way into the writing-task screen. */}
    {process.env.EXPO_PUBLIC_PHONE_AGENT === '1' && <View style={group}>
      <Row lead={icon(ChatIcon)} title={words.agentRow} onPress={() => router.push('/agent')} />
    </View>}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  page: { padding: space.xl, gap: space.m, paddingBottom: space.xxl },
  status: { padding: space.xl, borderRadius: shape.sheet },
  statusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { marginLeft: -space.xs },
  // Dot rests, faded, while Ownvoice is off.
  resting: { opacity: 0.55 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: space.l, borderRadius: shape.group, borderWidth: 1, borderStyle: 'dashed', padding: space.l },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
  growth: { gap: space.s, borderRadius: shape.group, padding: space.l },
  answers: { flexDirection: 'row', gap: space.m, marginTop: space.s },
  answerCol: { flex: 1, gap: space.xs, alignItems: 'flex-start' },
});
