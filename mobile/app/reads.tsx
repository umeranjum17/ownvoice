import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge } from '../src/ui/Badge';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { Page } from '../src/ui/Page';
import { Dot } from '../src/ui/Dot';
import { EyeIcon, TrashIcon } from '../src/ui/icons';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { plain, type Read } from '../src/core/privacy';
import { readLog, syncReadLog, wipeReadLog } from '../src/core/readLog';
import { wipeVoice } from '../src/core/voiceStore';
import Native from '../modules/ownvoice-native';

const dayOf = (time: number) => {
  const at = new Date(time);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (at.toDateString() === today.toDateString()) return words.today;
  if (at.toDateString() === yesterday.toDateString()) return words.yesterday;
  return at.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
};

/** What Ownvoice read: one line per bubble tap under its day, with the app's own icon, kept on this phone for
 *  30 days; Wipe everything asks once before it deletes. */
export default function Reads() {
  const t = useTheme();
  const [reads, setReads] = useState<Read[]>([]);
  const [icons, setIcons] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState(false);
  const [asking, setAsking] = useState(false);
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
  // Launcher icons for the apps in the list; a row without one keeps a plain eye badge.
  const apps = [...new Set(reads.map(read => read.app))].sort().join(',');
  useEffect(() => {
    if (!apps) return;
    let live = true;
    void Native.launcherApps(apps.split(',')).then(rows => { if (live && rows) setIcons(new Map(rows.map(({ app, icon }) => [app, icon]))); }).catch(() => {});
    return () => { live = false; };
  }, [apps]);
  // Privacy.wipe: the log, Your voice, and anything still held in memory.
  const wipe = async () => {
    if (wiping.current) return;
    wiping.current = true;
    setAsking(false);
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
  const days: [string, Read[]][] = [];
  for (const read of reads) {
    const day = dayOf(read.time);
    if (days.at(-1)?.[0] === day) days.at(-1)![1].push(read);
    else days.push([day, [read]]);
  }

  return <Page title={words.rowReads} note={words.readsNote} stickyTop onBack={() => router.back()}>
    {reads.length === 0 && <View style={[styles.empty, { backgroundColor: t.group }]}>
      <Dot mood="idle" size={72} />
      <Text style={[type.body, { color: t.text, textAlign: 'center' }]}>{words.nothingRead}</Text>
    </View>}
    {days.map(([day, rows]) => <View key={day} style={{ gap: space.s }}>
      <Text accessibilityRole="header" style={[type.label, { color: t.primary, marginTop: space.s }]}>{day}</Text>
      <View style={[styles.group, { backgroundColor: t.group }]}>
        {rows.map((read, index) => {
          const summary = plain(read.summary);
          const time = new Date(read.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const rest = summary.includes('. ') ? summary.slice(summary.indexOf('. ') + 2).replace(/\.$/, '') : '';
          const icon = icons.get(read.app);
          return <Row key={`${read.time}-${index}`} title={`${summary.split('. ')[0]} in ${read.label}`} subtitle={rest || undefined}
            lead={icon ? <Image source={{ uri: `data:image/png;base64,${icon}` }} style={styles.icon} accessibilityIgnoresInvertColors /> : <Badge><EyeIcon size={22} color={t.onPrimaryContainer} /></Badge>}
            end={<Text style={[type.note, { color: t.muted }]}>{time}</Text>} />;
        })}
      </View>
    </View>)}
    <View style={[styles.group, { backgroundColor: t.group, marginTop: space.m }]}>
      {asking
        ? <View style={styles.ask}>
          <Text style={[type.body, { color: t.text }]}>{words.wipeAsk}</Text>
          <View style={styles.actions}>
            <Button kind="filled" label={words.wipeYes} onPress={() => { void wipe(); }} />
            <Button kind="text" label={words.removeNo} onPress={() => setAsking(false)} />
          </View>
        </View>
        : <Row lead={<Badge><TrashIcon size={22} color={t.onPrimaryContainer} /></Badge>} title={words.wipe} subtitle={words.wipeVoiceNote} onPress={() => setAsking(true)} />}
      {error && !asking && <Text style={[type.note, styles.failed, { color: t.text }]}>{words.failed}</Text>}
    </View>
  </Page>;
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.m, borderRadius: shape.group, padding: space.xl },
  group: { borderRadius: shape.group, overflow: 'hidden', paddingVertical: space.xs },
  icon: { width: 40, height: 40, borderRadius: 12 },
  ask: { gap: space.m, padding: space.l },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s },
  failed: { paddingHorizontal: space.l, paddingBottom: space.m },
});
