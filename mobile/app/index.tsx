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
import { ChatIcon, EyeIcon, GridIcon, HandIcon, LockIcon, PauseIcon, PenIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble as bubbleInApp } from '../src/core/privacy';
import { store } from '../src/core/store';
import { SOURCE_KEY, type Source } from '../src/core/source';
import { agreed, downloading, getReady, modelStatus, resume, watch } from '../src/core/phoneDownload';
import { readLog, syncReadLog } from '../src/core/readLog';
import { loadVoice } from '../src/core/voice';
import { saveBubbleRules } from '../src/chatgpt/settings';
import Native, { type ModelStatus, type ServiceState } from '../modules/ownvoice-native';

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
  const [model, setModel] = useState<ModelStatus>('available');
  const [fraction, setFraction] = useState(0);
  const [fetching, setFetching] = useState(downloading);
  const [apps, setApps] = useState<App[]>([]);
  const [phrases, setPhrases] = useState(0);
  const [week, setWeek] = useState(0);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const busy = useRef(Promise.resolve());
  const readsBusy = useRef(Promise.resolve());

  const reload = useCallback(() => {
    void Native.serviceState().then(setService).catch(() => {});
    void modelStatus().then(setModel).catch(() => {});
    void Native.bubbleRules().then(setRules).catch(() => {});
    void Native.launcherApps(null).then(setApps).catch(() => {});
    setPhrases(loadVoice().never.length);
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
    const modelSettled = Native.addListener('onModelSettled', () => { void modelStatus().then(setModel).catch(() => {}); });
    // A download the person agreed to picks up where it stopped.
    void resume();
    return () => { shown.remove(); serviceChange.remove(); modelProgress(); modelSettled.remove(); };
  }, [reload]);

  useFocusEffect(useCallback(() => {
    if (store.get('setup-done')) reload();
  }, [reload]));

  const changeRules = (update: (current: Rules) => Rules) => {
    busy.current = busy.current.then(async () => {
      const next = update(await Native.bubbleRules());
      await saveBubbleRules(next);
      setRules(next);
      setSettingsFailed(false);
    }).catch(() => setSettingsFailed(true));
  };
  // The switch is the phone's own: turning it on goes to the permission screen, off stops the service.
  const power = (want: boolean) => {
    setSettingsFailed(false);
    if (want) router.push('/setup');
    else { void Native.turnOff().then(reload).catch(() => { reload(); setSettingsFailed(true); }); }
  };
  // The person's yes starts the one-time download (on Wi-Fi unless they pick mobile data).
  const start = (mobileData = false) => { void getReady(mobileData).catch(() => {}); };

  const paused = !!rules?.paused;
  const on = service === 'on';
  const yes = agreed();
  const getting = model === 'downloading' || fetching;
  // Ask for the download only where the person picked this phone (or hasn't picked yet), never under ChatGPT.
  const ask = model === 'downloadable' && !yes && !getting && store.get<Source>(SOURCE_KEY) !== 'chatgpt';
  const stopped = model === 'downloadable' && yes && !getting;
  const problem = model === 'unavailable' ? words.unsupported : stopped ? words.readyStopped : null;
  const green = on && !paused && problem === null && !ask;
  const headline = !on ? words.statusOff : ask ? words.readyTitle : problem ? words.statusNotReady : getting ? words.statusGettingReady : paused ? words.statusPaused : words.statusReady;
  const detail = !on ? words.statusOffNote : ask ? words.readyNote : problem ?? (getting ? words.gettingReady : paused ? words.statusPausedNote : words.statusReadyNote);
  const mood = !on ? 'idle' : ask ? 'hello' : problem ? 'check' : getting ? 'thinking' : paused ? 'idle' : 'ready';
  const onCard = green ? t.onPrimaryContainer : t.text;
  const icon = (Icon: typeof GridIcon) => <Badge><Icon size={22} color={t.onPrimaryContainer} /></Badge>;
  const shown = apps.filter(({ app }) => showsBubble(rules, app)).map(({ label }) => label);
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const, paddingVertical: space.xs };

  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={[styles.page, { paddingTop: inset + space.xl }]}>
    <Text accessibilityRole="header" style={[type.display, { color: t.text }]}>{words.homeTitle}</Text>
    <Text style={[type.body, { color: t.muted, marginBottom: space.m }]}>{words.home}</Text>

    <View style={[styles.status, { backgroundColor: green ? t.primaryContainer : t.group }]}>
      <View style={styles.statusHead}>
        <View style={[styles.dot, !on && styles.resting]}><Dot mood={mood} size={64} /></View>
        <Switch accessibilityLabel={words.powerRow} value={on} onValueChange={power} />
      </View>
      <Text style={[type.heading, { color: onCard, marginTop: space.l }]}>{headline}</Text>
      <Text style={[type.body, { color: green ? t.onPrimaryContainer : t.muted, marginTop: space.xs }]}>{detail}</Text>
      {on && getting && <View style={{ marginTop: space.l }}><Progress fraction={fraction} /></View>}
      {settingsFailed && <Text style={[type.body, { color: t.text, paddingTop: space.m }]}>{words.failed}</Text>}
      {(on && (problem !== null || ask) || service === 'stuck') && <View style={styles.statusActions}>
        {on && ask && <Button kind="filled" label={words.getReady} onPress={() => start()} />}
        {on && stopped && <Button kind="filled" label={words.tryAgain} onPress={() => start()} />}
        {on && stopped && <Button kind="text" label={words.useMobileData} onPress={() => start(true)} />}
        {on && model === 'unavailable' && <Button kind="filled" label={words.tryAgain} onPress={reload} />}
        {service === 'stuck' && <Button kind="filled" label={words.turnBackOn} onPress={() => router.push('/setup')} />}
      </View>}
    </View>

    <View style={group}>
      <Row lead={icon(LockIcon)} title={words.rowWriting} onPress={() => router.push('/writing')} />
      <Row lead={icon(GridIcon)} title={words.rowApps} subtitle={appsLine(shown)} onPress={() => router.push('/apps')} />
      <Row lead={icon(PenIcon)} title={words.rowVoice} subtitle={phrases === 0 ? words.noPhrases : phrases === 1 ? `1 ${words.phraseOne}` : `${phrases} ${words.phraseMany}`} onPress={() => router.push('/voice')} />
      <Row lead={icon(EyeIcon)} title={words.rowReads} subtitle={week === 0 ? words.nothingWeek : week === 1 ? words.onceWeek : `${week} ${words.timesWeek}`} onPress={() => router.push('/reads')} />
      <Row lead={icon(ChatIcon)} title={words.gptButton} subtitle={words.gptNote} onPress={() => router.push('/chatgpt')} />
    </View>

    <View style={group}>
      <Row lead={icon(PauseIcon)} title={words.rowPause} subtitle={words.rowPauseNote}
        end={<View pointerEvents="none"><Switch value={paused} disabled={!rules} onValueChange={v => changeRules(r => ({ ...r, paused: v }))} /></View>}
        onPress={() => { if (rules) changeRules(r => ({ ...r, paused: !r.paused })); }} />
      <Row lead={icon(HandIcon)} title={words.rowRewrite} subtitle={words.rowRewriteNote} />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: space.xl, gap: space.m, paddingBottom: space.xxl },
  status: { padding: space.xl, borderRadius: shape.sheet },
  statusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { marginLeft: -space.xs },
  // Dot rests, faded, while Ownvoice is off.
  resting: { opacity: 0.55 },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
});
