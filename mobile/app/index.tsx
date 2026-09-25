import { useEffect, useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { words } from '../src/core/words';
import type { TapFact } from '../modules/ownvoice-native';

type Rules = { paused: boolean; on: string[]; off: string[]; defaults: string[] };
const native = () => require('../modules/ownvoice-native').default;
export default function Home() {
  const [text, setText] = useState('Write a reply here');
  const [rules, setRules] = useState<Rules | null>(null);
  const [activity, setActivity] = useState(0);
  useEffect(() => { void native().bubbleRules().then(setRules).catch(() => {}); }, []);
  const change = (next: Rules) => { void native().setBubbleRules(next).then(() => setRules(next)).catch(() => {}); };
  const enabled = (app: string) => !!rules && (rules.on.includes(app) || (!rules.off.includes(app) && rules.defaults.includes(app)));
  const toggle = (app: string) => {
    if (!rules) return;
    const on = rules.on.filter(value => value !== app);
    const off = rules.off.filter(value => value !== app);
    if (enabled(app)) off.push(app); else on.push(app);
    change({ ...rules, on, off });
  };
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Ownvoice</Text>
    <Text>{words.home}</Text>
    <TextInput accessibilityLabel="Ownvoice test message" value={text} onChangeText={setText} multiline style={{ minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 12 }} />
    <Button title="Turn on accessibility" onPress={() => { void native().openAccessibilitySettings().catch(() => {}); }} />
    <Button disabled={!rules} title={enabled('dev.ownvoice.next') ? 'Hide the bubble here' : 'Show the bubble here'} onPress={() => toggle('dev.ownvoice.next')} />
    <Button disabled={!rules} title={enabled('com.android.chrome') ? 'Hide the bubble in Chrome' : 'Show the bubble in Chrome'} onPress={() => toggle('com.android.chrome')} />
    <Button disabled={!rules} title={rules?.paused ? 'Resume' : 'Pause for now'} onPress={() => { if (rules) change({ ...rules, paused: !rules.paused }); }} />
    <Button title={`Recent activity: ${activity}`} onPress={() => { void native().takeTapFacts().then((facts: TapFact[]) => setActivity(activity + facts.length)).catch(() => {}); }} />
    <Button title="Clear last screen" onPress={() => { void native().forget().catch(() => {}); }} />
  </View>;
}
