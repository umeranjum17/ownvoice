import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Native, { Capture } from '../../modules/ownvoice-native';
import { phoneWriter } from './phoneWriter';

export default function Panel() {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [inserting, setInserting] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [note, setNote] = useState('Writing…');
  useEffect(() => {
    let ready = false;
    const progress = Native.addListener('onModelProgress', ({ fraction }) => { if (!ready) setNote(`Getting Ownvoice ready… ${Math.round(fraction * 100)}%`); });
    void Native.capture().then(async value => {
      setCapture(value);
      if (value) setDrafts(await phoneWriter.write({ conversation: value.conversation, written: value.written, typed: value.typed }, () => { ready = true; setNote('Writing…'); }));
    }).catch(error => setNote(error instanceof Error ? error.message : 'Try again in a moment.'));
    return () => progress.remove();
  }, []);
  const close = () => { void Native.closePanel().catch(() => {}); };
  return <View style={styles.scrim}>
    <Pressable accessibilityLabel="Close" style={styles.outside} onPress={close} />
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <Text style={styles.title}>{capture?.typed ? 'Polish your message' : 'Suggested replies'}</Text>
      <Text style={styles.note}>{drafts.length ? 'Pick one to put in your message box. You send it yourself.' : note}</Text>
      {!capture?.hasField && <Text style={styles.note}>Tap into the message box first to use Insert, or copy one.</Text>}
      <ScrollView>{drafts.map(draft => <View key={draft} style={styles.card}>
        <Text style={styles.draft}>{draft}</Text>
        <View style={styles.actions}>
          <Pressable disabled={!capture?.hasField || inserting} onPress={() => { setInserting(true); void Native.insert(draft).catch(() => setInserting(false)); }}><Text style={[styles.action, (!capture?.hasField || inserting) && styles.disabled]}>Insert</Text></Pressable>
          <Pressable disabled={inserting} onPress={() => { void Native.copy(draft).catch(() => {}); }}><Text style={styles.action}>Copy</Text></Pressable>
        </View>
      </View>)}</ScrollView>
      <Pressable accessibilityRole="button" onPress={close} style={styles.close}><Text>Close</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#66000000' },
  outside: { flex: 1 },
  sheet: { maxHeight: '78%', backgroundColor: '#fffaf7', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 4, backgroundColor: '#c8c1bc', marginBottom: 18 },
  title: { fontSize: 21, fontWeight: '700', color: '#201a18' },
  note: { fontSize: 14, color: '#625b57', marginTop: 8 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginTop: 14, borderWidth: 1, borderColor: '#e8e1dc' },
  draft: { color: '#201a18', fontSize: 16, lineHeight: 23 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  action: { color: '#9b3525', fontWeight: '700', padding: 8 },
  disabled: { color: '#aaa' },
  close: { alignSelf: 'flex-end', padding: 12 },
});
