import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { words } from '../src/core/words';
import { DEFAULT_ON } from '../src/core/privacy';
import type { TapFact } from '../modules/ownvoice-native';

type Rules = { paused: boolean; on: string[]; off: string[] };
const native = () => require('../modules/ownvoice-native').default;
export default function Home() {
  const [text, setText] = useState('Write a reply here');
  const [rules, setRules] = useState<Rules | null>(null);
  const [activity, setActivity] = useState(0);
  const [apps, setApps] = useState<{ app: string; label: string }[] | null>(null);
  const [search, setSearch] = useState('');
  const pending = useRef(Promise.resolve());
  useEffect(() => { void native().bubbleRules().then(setRules).catch(() => {}); }, []);
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
  if (apps) return <View style={{ flex: 1, padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 24, fontWeight: '700' }}>Where the bubble shows</Text>
    <Text>In apps that are off, nothing is read.</Text>
    <TextInput accessibilityLabel="Find an app" placeholder="Find an app" value={search} onChangeText={setSearch} />
    <ScrollView keyboardShouldPersistTaps="always">
      {apps.filter(({ label }) => label.toLowerCase().includes(search.toLowerCase())).map(({ app, label }) =>
        <Button key={app} disabled={!rules} title={`${label}: ${enabled(app) ? 'On' : 'Off'}`} onPress={() => toggle(app)} />)}
    </ScrollView>
    <Button title="Back" onPress={() => { setApps(null); setSearch(''); }} />
  </View>;
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Ownvoice</Text>
    <Text>{words.home}</Text>
    <TextInput accessibilityLabel="Ownvoice test message" value={text} onChangeText={setText} multiline style={{ minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 12 }} />
    <Button title="Turn on accessibility" onPress={() => { void native().openAccessibilitySettings().catch(() => {}); }} />
    <Button disabled={!rules} title="Where the bubble shows" onPress={() => { void native().launcherApps().then(setApps).catch(() => {}); }} />
    <Button disabled={!rules} title={rules?.paused ? 'Resume' : 'Pause for now'} onPress={() => { if (rules) change(current => ({ ...current, paused: !current.paused })); }} />
    <Button title={`Recent activity: ${activity}`} onPress={() => { void native().takeTapFacts().then((facts: TapFact[]) => setActivity(count => count + facts.length)).catch(() => {}); }} />
    <Button title="Clear last screen" onPress={() => { void native().forget().catch(() => {}); }} />
  </View>;
}
