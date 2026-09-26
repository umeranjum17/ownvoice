import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { Progress } from '../src/ui/Progress';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { DEFAULT_ON } from '../src/core/privacy';
import { store } from '../src/core/store';
import { readLog, syncReadLog } from '../src/core/readLog';
import { loadVoice } from '../src/core/voice';
import Native, { type ModelStatus, type ServiceState } from '../modules/ownvoice-native';

type Rules = { paused: boolean; on: string[]; off: string[] };
type App = { app: string; label: string; icon: string | null };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether the bubble shows in [app]: the user's own choice for it, or else the default list. */
export const showsBubble = (rules: Rules | null, app: string) =>
  !!rules && (rules.on.includes(app) || (!rules.off.includes(app) && DEFAULT_ON.has(app)));

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
  const [rules, setRules] = useState<Rules | null>(null);
  const [service, setService] = useState<ServiceState>('off');
  const [model, setModel] = useState<ModelStatus>('available');
  const [fraction, setFraction] = useState(0);
  const [apps, setApps] = useState<App[]>([]);
  const [phrases, setPhrases] = useState(0);
  const [week, setWeek] = useState(0);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const busy = useRef(Promise.resolve());
  const readsBusy = useRef(Promise.resolve());

  const reload = useCallback(() => {
    void Native.serviceState().then(setService).catch(() => {});
    void Native.modelStatus().then(setModel).catch(() => {});
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
    const modelProgress = Native.addListener('onModelProgress', ({ fraction: f }) => setFraction(f));
    const modelSettled = Native.addListener('onModelSettled', () => { void Native.modelStatus().then(setModel).catch(() => {}); });
    return () => { shown.remove(); serviceChange.remove(); modelProgress.remove(); modelSettled.remove(); };
  }, [reload]);

  useFocusEffect(useCallback(() => {
    if (store.get('setup-done')) reload();
  }, [reload]));

  const changeRules = (update: (current: Rules) => Rules) => {
    busy.current = busy.current.then(async () => {
      const next = update(await Native.bubbleRules());
      await Native.setBubbleRules(next);
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
  const retry = () => { void Native.downloadModel().catch(() => {}).finally(reload); };

  const paused = !!rules?.paused;
  const on = service === 'on';
  const problem = model === 'unavailable' ? words.unsupported : model === 'downloadable' ? words.statusNotReadyNote : null;
  const green = on && !paused && problem === null;
  const headline = !on ? words.statusOff : problem ? words.statusNotReady : model !== 'available' ? words.statusGettingReady : paused ? words.statusPaused : words.statusReady;
  const detail = !on ? words.statusOffNote : problem ?? (model !== 'available' ? words.gettingReady : paused ? words.statusPausedNote : words.statusReadyNote);
  const shown = apps.filter(({ app }) => showsBubble(rules, app)).map(({ label }) => label);
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const };

  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={styles.page}>
    <Text style={[type.headline, { color: t.text }]}>{words.homeTitle}</Text>
    <Text style={[type.body, { color: t.text, marginBottom: space.l }]}>{words.home}</Text>

    <View style={[styles.status, { backgroundColor: green ? t.primaryContainer : t.group }]}>
      <View style={styles.statusHead}>
        <View style={styles.statusWords}>
          <Text style={[type.title, { color: green ? t.onPrimaryContainer : t.text }]}>{headline}</Text>
          <Text style={[type.body, { color: green ? t.onPrimaryContainer : t.muted }]}>{detail}</Text>
        </View>
        <Switch accessibilityLabel={words.powerRow} value={on} onValueChange={power} />
      </View>
      {on && model !== 'available' && !problem && <View style={{ marginTop: space.m }}><Progress fraction={fraction} /></View>}
      {problem !== null && <Text accessibilityRole="button" onPress={retry} style={[type.label, { color: green ? t.onPrimaryContainer : t.primary, paddingTop: space.m }]}>{words.tryAgain}</Text>}
      {settingsFailed && <Text style={[type.body, { color: t.text, paddingTop: space.m }]}>{words.failed}</Text>}
      {service === 'stuck' && <Text accessibilityRole="button" onPress={() => router.push('/setup')} style={[type.label, { color: green ? t.onPrimaryContainer : t.primary, paddingTop: space.m }]}>{words.turnBackOn}</Text>}
    </View>

    <View style={group}>
      <Row title={words.rowApps} subtitle={appsLine(shown)} onPress={() => router.push('/apps')} />
      <Row title={words.rowVoice} subtitle={phrases === 0 ? words.noPhrases : phrases === 1 ? `1 ${words.phraseOne}` : `${phrases} ${words.phraseMany}`} onPress={() => router.push('/voice')} />
      <Row title={words.rowReads} subtitle={week === 0 ? words.nothingWeek : week === 1 ? words.onceWeek : `${week} ${words.timesWeek}`} onPress={() => router.push('/reads')} />
    </View>

    <View style={group}>
      <Row title={words.rowPause} subtitle={words.rowPauseNote}
        end={<View pointerEvents="none"><Switch value={paused} disabled={!rules} onValueChange={v => changeRules(r => ({ ...r, paused: v }))} /></View>}
        onPress={() => { if (rules) changeRules(r => ({ ...r, paused: !r.paused })); }} />
      <Row title={words.rowRewrite} subtitle={words.rowRewriteNote} />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: space.xl, gap: space.m, paddingBottom: space.xxl },
  status: { padding: space.xl, paddingVertical: space.l, borderRadius: shape.sheet },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: space.l },
  statusWords: { flex: 1 },
});
