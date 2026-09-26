import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { plain, type Read } from '../src/core/privacy';
import { readLog, syncReadLog, wipeReadLog } from '../src/core/readLog';
import { wipeVoice } from '../src/core/voice';
import Native from '../modules/ownvoice-native';

/** What Ownvoice read: one line per bubble tap, kept on this phone for 30 days, and one tap to wipe it all. */
export default function Reads() {
  const t = useTheme();
  const [reads, setReads] = useState<Read[]>([]);
  const [error, setError] = useState(false);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const wiping = useRef(false);
  const refresh = useCallback(() => {
    if (wiping.current) return;
    pending.current = pending.current.then(() => syncReadLog().then(rows => {
      if (!wiping.current) setReads(rows);
    }).catch(() => { if (!wiping.current) setReads(readLog()); }));
  }, []);
  useEffect(() => {
    refresh();
    const shown = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => shown.remove();
  }, [refresh]);
  // Privacy.wipe: the log, Your voice, and anything still held in memory.
  const wipe = async () => {
    if (wiping.current) return;
    wiping.current = true;
    setError(false);
    try {
      await pending.current;
      await Promise.all([Native.forget(), Native.clearTapFacts()]);
      wipeReadLog();
      wipeVoice();
      setReads([]);
    } catch { setError(true); }
    finally { wiping.current = false; }
  };
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const };

  return <ScrollView style={{ flex: 1, backgroundColor: t.sheet }} contentContainerStyle={{ padding: space.xl, gap: space.m, paddingBottom: space.xxl }}>
    <Text style={[type.headline, { color: t.text }]}>{words.rowReads}</Text>
    <Text style={[type.body, { color: t.muted, marginBottom: space.s }]}>{words.readsNote}</Text>
    <View style={styles.actions}>
      <Button kind="text" label={words.wipe} onPress={() => { void wipe(); }} />
    </View>
    {error && <Text style={[type.body, { color: t.text }]}>{words.failed}</Text>}
    <Text style={[type.body, { color: t.muted }]}>{words.wipeVoiceNote}</Text>
    <View style={group}>
      {reads.length === 0 && <Row title={words.nothingRead} />}
      {reads.map((read, index) => {
        const summary = plain(read.summary);
        const at = new Date(read.time);
        const day = at.toDateString() === new Date().toDateString() ? words.today : at.toLocaleDateString();
        const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const rest = summary.includes('. ') ? summary.slice(summary.indexOf('. ') + 2).replace(/\.$/, '') : '';
        return <Row key={`${read.time}-${index}`} title={`${summary.split('. ')[0]} in ${read.label}`} subtitle={[rest, `${day}, ${time}`].filter(Boolean).join(' · ')} />;
      })}
    </View>
    <Button kind="text" label={words.back} onPress={() => router.back()} />
  </ScrollView>;
}

const styles = { actions: { flexDirection: 'row' as const } };
