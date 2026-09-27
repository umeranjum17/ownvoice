import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { Switch } from '../src/ui/Switch';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { showsBubble } from './index';
import { saveBubbleRules } from '../src/chatgpt/settings';
import Native from '../modules/ownvoice-native';

type Rules = { paused: boolean; on: string[]; off: string[] };
type App = { app: string; label: string; icon: string | null };

/** Where the bubble shows: one switch per app with a launcher icon, switched-on ones first. */
export default function Apps() {
  const t = useTheme();
  const inset = useSafeAreaInsets().top;
  const [rules, setRules] = useState<Rules | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [filter, setFilter] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const busy = useRef(Promise.resolve());
  useEffect(() => {
    void Native.bubbleRules().then(setRules).catch(() => {});
    // Launcher icons only come back for a named list, so ask for the whole screen's worth in one go.
    void Native.launcherApps(null).then(rows => Native.launcherApps(rows.map(({ app }) => app))).then(setApps).catch(() => {});
  }, []);
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
  const order = (a: App, b: App) => Number(showsBubble(rules, b.app)) - Number(showsBubble(rules, a.app)) || a.label.localeCompare(b.label);
  const shown = apps.filter(({ label }) => label.toLowerCase().includes(filter.toLowerCase())).sort(order);
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const };

  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={{ padding: space.xl, paddingTop: inset + space.xl, gap: space.m, paddingBottom: space.xxl }} keyboardShouldPersistTaps="always">
    <Text style={[type.headline, { color: t.text }]}>{words.rowApps}</Text>
    <Text style={[type.body, { color: t.muted, marginBottom: space.s }]}>{words.appsScreenNote}</Text>
    {saveFailed && <Text style={[type.body, { color: t.text }]}>{words.failed}</Text>}
    <TextInput accessibilityLabel={words.findAnApp} placeholder={words.findAnApp} placeholderTextColor={t.muted} value={filter} onChangeText={setFilter}
      style={[type.body, { color: t.text, borderColor: t.outline, borderWidth: 1, borderRadius: shape.card, padding: space.m }]} />
    <View style={group}>
      {shown.map(({ app, label, icon }) => <Row key={app}
        lead={icon ? <Image source={{ uri: `data:image/png;base64,${icon}` }} style={styles.icon} accessibilityIgnoresInvertColors /> : undefined}
        title={label} subtitle={showsBubble(rules, app) ? words.on : words.off} disabled={!rules}
        end={<View pointerEvents="none"><Switch accessibilityLabel={label} value={showsBubble(rules, app)} disabled={!rules} onValueChange={() => toggle(app)} /></View>}
        onPress={() => toggle(app)} />)}
    </View>
    <Button kind="text" label={words.back} onPress={() => router.back()} />
  </ScrollView>;
}

const styles = { icon: { width: 40, height: 40, borderRadius: 10 } };
