import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Page } from '../src/ui/Page';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { growthCounts, trendOf, type GrowthCount } from '../src/core/store';

/** Numbers he typed for one platform, oldest first; blanks and non-numbers never reach the trend. */
const numbers = (rows: GrowthCount[], pick: (row: GrowthCount) => string): number[] => {
  const out: number[] = [];
  for (const row of rows) {
    const raw = pick(row).trim();
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
};

const trendWord = (values: number[]): string => {
  const trend = trendOf(values);
  return trend === 'up' ? words.growthUp : trend === 'same' ? words.growthSame : trend === 'down' ? words.growthDown : words.growthNew;
};

/** His own counts as short bars scaled across this series' own low and high, so a rise or
 *  fall shows; one count needs no chart, since its number is already above. */
function Bars({ values }: { values: number[] }) {
  const t = useTheme();
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const range = Math.max(...values) - low || 1;
  return <View style={styles.bars}>
    {values.map((value, i) => <View key={i} style={[styles.bar, { height: 10 + 38 * ((value - low) / range), backgroundColor: t.primary }]} />)}
  </View>;
}

const weekLabel = (indexFromLatest: number) =>
  indexFromLatest === 0 ? words.weekThis : indexFromLatest === 1 ? words.weekLast : words.weekOlder;

/** Your growth: his own typed counts as bars and plain trend words. Since he started, never a cause. */
export default function Growth() {
  const t = useTheme();
  const [rows, setRows] = useState<GrowthCount[]>([]);
  const refresh = useCallback(() => {
    try { setRows(growthCounts()); } catch {}
  }, []);
  useFocusEffect(refresh);
  const xs = numbers(rows, row => row.x);
  const ks = numbers(rows, row => row.reddit);
  const latest = rows.at(-1);

  return <Page title={words.growthTitle} note={words.growthNote} stickyTop onBack={() => router.back()}>
    {rows.length === 0 && <Text style={[type.body, { color: t.text }]}>{words.growthEmpty}</Text>}
    {rows.length > 0 && <View style={[styles.group, { backgroundColor: t.group }]}>
      <View style={styles.section}>
        <Text style={[type.label, { color: t.text }]}>{words.weeklyX}</Text>
        {latest?.x.trim() ? <Text style={[type.heading, { color: t.text }]}>{latest.x.trim()}</Text> : null}
        <Text style={[type.note, { color: t.muted }]}>{trendWord(xs)}</Text>
        <Bars values={xs} />
      </View>
      <View style={styles.section}>
        <Text style={[type.label, { color: t.text }]}>{words.weeklyReddit}</Text>
        {latest?.reddit.trim() ? <Text style={[type.heading, { color: t.text }]}>{latest.reddit.trim()}</Text> : null}
        <Text style={[type.note, { color: t.muted }]}>{trendWord(ks)}</Text>
        <Bars values={ks} />
      </View>
    </View>}
    {[...rows].reverse().map((row, i) => <View key={`${row.at}-${i}`} style={[styles.group, { backgroundColor: t.group }]}>
      <Text style={[type.label, { color: t.primary }]}>{weekLabel(i)}</Text>
      {row.x.trim() ? <Text style={[type.body, { color: t.text }]}>{`${words.weeklyX}: ${row.x.trim()}`}</Text> : null}
      {row.reddit.trim() ? <Text style={[type.body, { color: t.text }]}>{`${words.weeklyReddit}: ${row.reddit.trim()}`}</Text> : null}
    </View>)}
  </Page>;
}

const styles = StyleSheet.create({
  group: { borderRadius: shape.group, overflow: 'hidden', padding: space.l, gap: space.s },
  section: { gap: space.xs, paddingVertical: space.s },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, paddingTop: space.s },
  bar: { flex: 1, borderRadius: 3, minHeight: 8 },
});
