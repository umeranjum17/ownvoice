import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
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

/** His own counts as a thin honest line: scaled over a padded range centred on the data
 *  (span = the series spread or a tenth of the latest count, whichever is wider), so a small
 *  change draws small and a flat series sits level mid-height. The trend words stay the signal;
 *  one count needs no chart, since its number is already above. */
const CHART_H = 48;
function Bars({ values }: { values: number[] }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  if (values.length < 2) return null;
  const latest = values[values.length - 1];
  const span = Math.max(Math.max(...values) - Math.min(...values), Math.abs(latest) * 0.1) || 1;
  const mid = (Math.max(...values) + Math.min(...values)) / 2;
  const y = (v: number) => CHART_H - 6 - ((v - (mid - span / 2)) / span) * (CHART_H - 12);
  const x = (i: number) => (i / (values.length - 1)) * Math.max(width - 8, 1) + 4;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return <View style={styles.line} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    {width > 0 && <Svg width={width} height={CHART_H} viewBox={`0 0 ${width} ${CHART_H}`}>
      <Polyline points={points} fill="none" stroke={t.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={t.primary} />)}
    </Svg>}
  </View>;
}

const weekLabel = (indexFromLatest: number) =>
  indexFromLatest === 0 ? words.weekThis : indexFromLatest === 1 ? words.weekLast : words.weekOlder;

/** Your growth: his own typed counts as a line and plain trend words. Since he started, never a cause. */
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
  line: { height: CHART_H, paddingTop: space.s },
});
