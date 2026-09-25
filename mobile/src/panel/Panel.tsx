import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Native, { Capture } from '../../modules/ownvoice-native';
import { words } from '../core/words';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Sheet } from '../ui/Sheet';
import { Progress } from '../ui/Progress';
import { space, type, useTheme } from '../ui/theme';
import { phoneWriter } from './phoneWriter';

export default function Panel() {
  const t = useTheme();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [inserting, setInserting] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [note, setNote] = useState('Writing…');
  const [fraction, setFraction] = useState<number | null>(null);
  useEffect(() => {
    let ready = false;
    const progress = Native.addListener('onModelProgress', ({ fraction }) => { if (!ready) setFraction(fraction); });
    void Native.capture().then(async value => {
      setCapture(value);
      if (!value) {
        ready = true;
        setFraction(null);
        setNote('No screen to read. Close and try again.');
        return;
      }
      setDrafts(await phoneWriter.write({ conversation: value.conversation, written: value.written, typed: value.typed }, state => {
        ready = state === 'writing';
        setNote(ready ? 'Writing…' : words.gettingReady);
        if (ready) setFraction(null);
      }));
      setFraction(null);
    }).catch(error => { ready = true; setFraction(null); setNote(error instanceof Error ? error.message : 'Try again in a moment.'); });
    return () => progress.remove();
  }, []);
  const close = () => { void Native.closePanel().catch(() => {}); };
  return <Sheet
    title={capture?.typed.trim() ? 'Polish your message' : 'Suggested replies'}
    note={drafts.length ? 'Pick one to put in your message box. You send it yourself.' : note}
    onClose={close}>
    {fraction != null && <View style={{ marginBottom: space.m }}><Progress fraction={fraction} /></View>}
    {capture && !capture.hasField && <Text style={[type.note, { color: t.muted, marginBottom: space.m }]}>Tap into the message box first to use Insert, or copy one.</Text>}
    {drafts.map(draft => <View key={draft} style={{ marginBottom: space.m }}>
      <Card variant="outlined">
        <Text style={[type.words, { color: t.text }]}>{draft}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.s, marginTop: space.m }}>
          <Button kind="filled" label="Insert" disabled={!capture?.hasField || inserting} onPress={() => { setInserting(true); void Native.insert(draft).catch(() => setInserting(false)); }} />
          <Button kind="text" label="Copy" disabled={inserting} onPress={() => { void Native.copy(draft).catch(() => {}); }} />
        </View>
      </Card>
    </View>)}
  </Sheet>;
}
