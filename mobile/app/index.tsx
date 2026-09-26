import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Row } from '../src/ui/Row';
import { space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { DEFAULT_ON } from '../src/core/privacy';
import { store } from '../src/core/store';
import type { TapFact } from '../modules/ownvoice-native';

type Rules = { paused: boolean; on: string[]; off: string[] };
const native = () => require('../modules/ownvoice-native').default;
export default function Home() {
  const t = useTheme();
  const [text, setText] = useState('');
  const [rules, setRules] = useState<Rules | null>(null);
  const [activity, setActivity] = useState(0);
  const [apps, setApps] = useState<{ app: string; label: string }[] | null>(null);
  const [search, setSearch] = useState('');
  const pending = useRef(Promise.resolve());
  useEffect(() => {
    void native().bubbleRules().then(setRules).catch(() => {});
    // Setup opens on launch until it's done or the service is on (S6); the service also returns
    // here through the ownvoice://setup deep link while it is still going.
    if (!store.get('setup-done')) void native().serviceState().then((s: string) => { if (s !== 'on') router.replace('/setup'); }).catch(() => {});
  }, []);
  const change = (update: (current: Rules) => Rules) => {
    pending.current = pending.current.then(async () => {
      const next = update(await native().bubbleRules());
      await native().setBubbleRules(next);
      setRules(next);
    }).catch(() => {});
  };
  const enabled = (app: string, current = rules) => !!current && (current.on.includes(app) || (!current.off.includes(app) && DEFAULT_ON.has(app)));
  const toggle = (app: string) => {
    if (!rules) return;
    change(current => {
      const on = current.on.filter(value => value !== app);
      const off = current.off.filter(value => value !== app);
      if (enabled(app, current)) off.push(app); else on.push(app);
      return { ...current, on, off };
    });
  };
  if (apps) return <View style={{ flex: 1, padding: space.xl, gap: space.l, backgroundColor: t.sheet }}>
    <Text style={[type.title, { color: t.text }]}>Where the bubble shows</Text>
    <Text style={[type.body, { color: t.muted }]}>In apps that are off, nothing is read.</Text>
    <TextInput accessibilityLabel="Find an app" placeholder="Find an app" placeholderTextColor={t.muted} value={search} onChangeText={setSearch} style={[type.body, { color: t.text, borderColor: t.outline, borderWidth: 1, borderRadius: 16, padding: space.m }]} />
    <ScrollView keyboardShouldPersistTaps="always">
      {apps.filter(({ label }) => label.toLowerCase().includes(search.toLowerCase())).map(({ app, label }) =>
        <Row key={app} disabled={!rules} title={label} subtitle={enabled(app) ? 'On' : 'Off'} onPress={() => toggle(app)} />)}
    </ScrollView>
    <Button kind="text" label="Back" onPress={() => { setApps(null); setSearch(''); }} />
  </View>;
  return <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.l, backgroundColor: t.sheet }}>
    <Text style={[type.headline, { color: t.text }]}>Ownvoice</Text>
    <Text style={[type.body, { color: t.text }]}>{words.home}</Text>
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%' }}><Card variant="filled" label="Sam">
      <Text style={[type.body, { color: t.text }]}>Are we still on for Saturday?{'\n'}I can bring the tent if you bring the stove.</Text>
    </Card></View>
    <TextInput accessibilityLabel="Message" placeholder="Message" placeholderTextColor={t.muted} value={text} onChangeText={setText} multiline style={[type.body, { minHeight: 56, borderWidth: 1, borderColor: t.outline, borderRadius: 12, padding: space.m, color: t.text }]} />
    <Button kind="filled" label="Turn on Ownvoice" onPress={() => { void native().openAccessibilitySettings().catch(() => {}); }} />
    <Button kind="text" disabled={!rules} label="Where the bubble shows" onPress={() => { void native().launcherApps().then(setApps).catch(() => {}); }} />
    <Button kind="text" disabled={!rules} label={rules?.paused ? 'Resume' : 'Pause for now'} onPress={() => { if (rules) change(current => ({ ...current, paused: !current.paused })); }} />
    <Button kind="text" label={`Recent activity: ${activity}`} onPress={() => { void native().takeTapFacts().then((facts: TapFact[]) => setActivity(count => count + facts.length)).catch(() => {}); }} />
    <Button kind="text" label="Clear last screen" onPress={() => { void native().forget().catch(() => {}); }} />
  </View>;
}
