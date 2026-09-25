import { useEffect, useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { words } from '../src/core/words';

const testApps = ['dev.ownvoice.next', 'com.android.chrome'];
const native = () => require('../modules/ownvoice-native').default;
export default function Home() {
  const [text, setText] = useState('Write a reply here');
  const [paused, setPaused] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [activity, setActivity] = useState(0);
  const rules = (nextPaused: boolean, nextEnabled: boolean) => native().setBubbleRules({ paused: nextPaused, on: nextEnabled ? testApps : ['com.android.chrome'], off: nextEnabled ? [] : ['dev.ownvoice.next'], defaults: [] });
  useEffect(() => { rules(false, true); }, []);
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 28, fontWeight: '700' }}>Ownvoice</Text>
    <Text>{words.home}</Text>
    <TextInput accessibilityLabel="Ownvoice test message" value={text} onChangeText={setText} multiline style={{ minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 12 }} />
    <Button title="Turn on accessibility" onPress={() => native().openAccessibilitySettings()} />
    <Button title={enabled ? 'Hide the bubble here' : 'Show the bubble here'} onPress={() => { const next = !enabled; setEnabled(next); rules(paused, next); }} />
    <Button title={paused ? 'Resume' : 'Pause for now'} onPress={() => { const next = !paused; setPaused(next); rules(next, enabled); }} />
    <Button title={`Recent activity: ${activity}`} onPress={() => setActivity(activity + native().takeTapFacts().length)} />
    <Button title="Clear last screen" onPress={() => native().forget()} />
  </View>;
}
