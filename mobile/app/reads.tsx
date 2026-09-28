import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { Page } from '../src/ui/Page';
import { Dot } from '../src/ui/Dot';
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
    }).catch(() => { if (!wiping.current) { try { setReads(readLog()); } catch { setError(true); } } }));
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
      await Native.forget();
      await wipeReadLog();
      wipeVoice();
      setReads([]);
    } catch { setError(true); }
    finally { wiping.current = false; }
  };
  const group = { borderRadius: shape.group, backgroundColor: t.group, overflow: 'hidden' as const, paddingVertical: space.xs };

  return <Page title={words.rowReads} note={words.readsNote} onBack={() => router.back()}>
    {error && <Text style={[type.body, { color: t.text }]}>{words.failed}</Text>}
    {reads.length === 0 && <View style={[styles.empty, { backgroundColor: t.group }]}>
      <Dot mood="idle" size={64} />
      <Text style={[type.body, { color: t.text, textAlign: 'center' }]}>{words.nothingRead}</Text>
    </View>}
    {reads.length > 0 && <View style={group}>
      {reads.map((read, index) => {
        const summary = plain(read.summary);
        const at = new Date(read.time);
        const day = at.toDateString() === new Date().toDateString() ? words.today : at.toLocaleDateString();
        const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const rest = summary.includes('. ') ? summary.slice(summary.indexOf('. ') + 2).replace(/\.$/, '') : '';
        return <Row key={`${read.time}-${index}`} title={`${summary.split('. ')[0]} in ${read.label}`} subtitle={[rest, `${day}, ${time}`].filter(Boolean).join(' · ')} />;
      })}
    </View>}
    <View style={[styles.wipe, { backgroundColor: t.group }]}>
      <Text style={[type.note, { color: t.muted, flex: 1 }]}>{words.wipeVoiceNote}</Text>
      <Button kind="text" label={words.wipe} onPress={() => { void wipe(); }} />
    </View>
  </Page>;
}

const styles = {
  empty: { alignItems: 'center' as const, gap: space.m, borderRadius: shape.group, padding: space.xl },
  wipe: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.s, borderRadius: shape.group, paddingLeft: space.l, paddingVertical: space.xs },
};
