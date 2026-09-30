import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Empty } from '../src/ui/Empty';
import { Page } from '../src/ui/Page';
import { Placeholder } from '../src/ui/Placeholder';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { CloseIcon, SearchIcon, WarnIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble } from './index';
import { saveBubbleRules } from '../src/chatgpt/settings';
import Native from '../modules/ownvoice-native';

type Rules = { paused: boolean; on: string[]; off: string[] };
type App = { app: string; label: string; icon: string | null };

/** Where the bubble shows: a search, then the apps it shows in and the other apps, one switch each.
 *  The two groups are fixed on arrival, so a row never jumps away from the finger that tapped it. */
export default function Apps() {
  const t = useTheme();
  const [rules, setRules] = useState<Rules | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const [shownAtStart, setShownAtStart] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState('');
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const busy = useRef(Promise.resolve());
  const load = () => {
    setFailed(false);
    // Launcher icons only come back for a named list, so ask for the whole screen's worth in one go.
    void Promise.all([Native.bubbleRules(), Native.launcherApps(null).then(rows => Native.launcherApps(rows.map(({ app }) => app)))])
      .then(([r, a]) => { setRules(r); setApps(a); setShownAtStart(new Set(a.filter(({ app }) => showsBubble(r, app)).map(({ app }) => app))); })
      .catch(() => setFailed(true));
  };
  useEffect(load, []);
  const toggle = (app: string) => {
    busy.current = busy.current.then(async () => {
      const current = await Native.bubbleRules();
      const on = current.on.filter(x => x !== app);
      const off = current.off.filter(x => x !== app);
      if (showsBubble(current, app)) off.push(app); else on.push(app);
      const next = { ...current, on, off };
      await saveBubbleRules(next);
      setRules(next);
      setSaveFailed(false);
    }).catch(() => setSaveFailed(true));
  };
  const matches = (apps ?? []).filter(({ label }) => label.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));
  const first = matches.filter(({ app }) => shownAtStart?.has(app));
  const rest = matches.filter(({ app }) => !shownAtStart?.has(app));
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const, paddingVertical: space.xs };
  const label = (text: string) => <Text accessibilityRole="header" style={[type.label, { color: t.primary, marginTop: space.s, marginLeft: space.xs }]}>{text}</Text>;
  const rows = (list: App[]) => <View style={group}>
    {list.map(({ app, label, icon }) => <Row key={app}
      lead={icon ? <Image source={{ uri: `data:image/png;base64,${icon}` }} style={styles.icon} accessibilityIgnoresInvertColors /> : <View style={[styles.icon, { backgroundColor: t.yours }]} />}
      title={label} subtitle={showsBubble(rules, app) ? words.on : words.off}
      end={<View pointerEvents="none"><Switch accessibilityLabel={label} value={showsBubble(rules, app)} onValueChange={() => toggle(app)} /></View>}
      onPress={() => toggle(app)} />)}
  </View>;

  return <Page title={words.rowApps} note={words.appsScreenNote} onBack={() => router.back()}>
    {saveFailed && <View style={styles.warn}>
      <WarnIcon size={20} color={t.attention} />
      <Text style={[type.body, { color: t.text, flex: 1 }]}>{words.failed}</Text>
    </View>}
    {failed && <Empty mood="check" text={words.gptAppsUnavailable}><Button kind="filled" label={words.tryAgain} onPress={load} /></Empty>}
    {!failed && !apps && <Placeholder />}
    {apps && <>
      <View style={[styles.search, { backgroundColor: t.raised }]}>
        <SearchIcon size={22} color={t.muted} />
        <TextInput accessibilityLabel={words.findAnApp} placeholder={words.findAnApp} placeholderTextColor={t.muted} value={filter} onChangeText={setFilter}
          autoCorrect={false} style={[type.body, { color: t.text, flex: 1, paddingVertical: space.m }]} />
        {!!filter && <Pressable accessibilityRole="button" accessibilityLabel={words.clearSearch} onPress={() => setFilter('')} hitSlop={8}
          android_ripple={{ color: t.text + '1F', borderless: true, radius: 20 }} style={styles.clear}>
          <CloseIcon size={20} color={t.muted} />
        </Pressable>}
      </View>
      {!matches.length && <Empty mood="idle" text={words.appsNoMatch} />}
      {(!filter.trim() || !!first.length) && <>
        {label(words.appsShown)}
        {first.length ? rows(first) : <Text style={[type.body, { color: t.muted, marginLeft: space.xs }]}>{words.appsNoneShown}</Text>}
      </>}
      {!!rest.length && <>{label(words.appsOther)}{rows(rest)}</>}
    </>}
  </Page>;
}

const styles = {
  icon: { width: 40, height: 40, borderRadius: 12 },
  search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.m, borderRadius: shape.round, paddingLeft: space.l, paddingRight: space.s, minHeight: 56 },
  clear: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
  warn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.m },
};
