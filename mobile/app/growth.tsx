import { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { router, useFocusEffect } from 'expo-router';
import { Page } from '../src/ui/Page';
import { Button } from '../src/ui/Button';
import { shape, space, type, useTheme } from '../src/ui/theme';
import { words } from '../src/core/words';
import { COUNTS_WEEK_MS, growthCounts, saveGrowthCount, trendOf, type GrowthCount } from '../src/core/store';

type Observation = { at: number; value: number };
const numbers = (rows: GrowthCount[], platform: 'x' | 'reddit'): Observation[] =>
  rows.filter(row => row[platform].trim() !== '').map(row => ({ at: row.at, value: Number(row[platform]) }))
    .filter(row => Number.isFinite(row.value)).sort((a, b) => a.at - b.at);

const trendWord = (values: Observation[]): string => {
  const trend = trendOf(values.map(row => row.value));
  if (!trend) return words.growthNew;
  const [prev, last] = values.slice(-2);
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7).getTime();
  const lastWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7 - 7).getTime();
  const gap = last.at - prev.at;
  const weekly = last.at >= weekStart && last.at <= now.getTime() && prev.at >= lastWeekStart && prev.at < weekStart
    && gap >= COUNTS_WEEK_MS - 24 * 3600_000 && gap <= COUNTS_WEEK_MS + 24 * 3600_000;
  return trend === 'up' ? (weekly ? words.growthUp : words.growthUpChecked)
    : trend === 'same' ? (weekly ? words.growthSame : words.growthSameChecked)
      : weekly ? words.growthDown : words.growthDownChecked;
};

const CHART_H = 48;
function Bars({ values }: { values: Observation[] }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  if (values.length < 2) return null;
  const counts = values.map(row => row.value);
  const latest = counts[counts.length - 1];
  const span = Math.max(Math.max(...counts) - Math.min(...counts), Math.abs(latest) * 0.1) || 1;
  const mid = (Math.max(...counts) + Math.min(...counts)) / 2;
  const y = (v: number) => CHART_H - 6 - ((v - (mid - span / 2)) / span) * (CHART_H - 12);
  const elapsed = values[values.length - 1].at - values[0].at;
  const x = (at: number) => (elapsed ? (at - values[0].at) / elapsed : 0.5) * Math.max(width - 8, 1) + 4;
  const points = values.map(row => `${x(row.at).toFixed(1)},${y(row.value).toFixed(1)}`).join(' ');
  return <View style={styles.line} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    {width > 0 && <Svg width={width} height={CHART_H} viewBox={`0 0 ${width} ${CHART_H}`}>
      <Polyline points={points} fill="none" stroke={t.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((row, i) => <Circle key={i} cx={x(row.at)} cy={y(row.value)} r={3.5} fill={t.primary} />)}
    </Svg>}
  </View>;
}

export default function Growth() {
  const t = useTheme();
  const [rows, setRows] = useState<GrowthCount[]>([]);
  const [xCount, setXCount] = useState('');
  const [karma, setKarma] = useState('');
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(() => {
    try { setRows(growthCounts()); setFailed(false); } catch { setFailed(true); }
  }, []);
  useFocusEffect(refresh);
  const saveCounts = () => {
    if (!xCount.trim() && !karma.trim()) return;
    setSaved(false);
    try {
      saveGrowthCount(xCount, karma);
    } catch { setFailed(true); return; }
    setXCount(''); setKarma('');
    setSaved(true);
    refresh();
  };
  const xs = numbers(rows, 'x');
  const ks = numbers(rows, 'reddit');

  return <Page title={words.growthTitle} note={words.growthNote} stickyTop onBack={() => router.back()}>
    <View style={[styles.group, { backgroundColor: t.group }]}>
      <Text style={[type.label, { color: t.text }]}>{words.weeklyTitle}</Text>
      <Text style={[type.note, { color: t.muted }]}>{words.weeklyNote}</Text>
      <Text style={[type.note, { color: t.muted }]}>{words.countFormat}</Text>
      <TextInput accessibilityLabel={words.weeklyX} placeholder={words.weeklyX} value={xCount}
        onChangeText={value => { setXCount(value); setSaved(false); }} keyboardType="number-pad"
        style={[styles.count, { color: t.text, borderColor: t.line }]} />
      <TextInput accessibilityLabel={words.weeklyReddit} placeholder={words.weeklyReddit} value={karma}
        onChangeText={value => { setKarma(value); setSaved(false); }} keyboardType="numbers-and-punctuation"
        style={[styles.count, { color: t.text, borderColor: t.line }]} />
      <Button kind="filled" label={words.weeklySave} onPress={saveCounts} />
      {saved && <Text style={[type.note, { color: t.muted }]}>{words.weeklySaved}</Text>}
      {failed && <Text style={[type.note, { color: t.text }]}>{words.outcomeFailed}</Text>}
    </View>
    {rows.length === 0 && !failed && <Text style={[type.body, { color: t.text }]}>{words.growthEmpty}</Text>}
    {rows.length > 0 && <View style={[styles.group, { backgroundColor: t.group }]}>
      <View style={styles.section}>
        <Text style={[type.label, { color: t.text }]}>{words.weeklyX}</Text>
        {xs.length > 0 && <Text style={[type.heading, { color: t.text }]}>{String(xs.at(-1)!.value)}</Text>}
        <Text style={[type.note, { color: t.muted }]}>{trendWord(xs)}</Text>
        <Bars values={xs} />
      </View>
      <View style={styles.section}>
        <Text style={[type.label, { color: t.text }]}>{words.weeklyReddit}</Text>
        {ks.length > 0 && <Text style={[type.heading, { color: t.text }]}>{String(ks.at(-1)!.value)}</Text>}
        <Text style={[type.note, { color: t.muted }]}>{trendWord(ks)}</Text>
        <Bars values={ks} />
      </View>
    </View>}
  </Page>;
}

const styles = StyleSheet.create({
  group: { borderRadius: shape.group, overflow: 'hidden', padding: space.l, gap: space.s },
  section: { gap: space.xs, paddingVertical: space.s },
  line: { height: CHART_H, paddingTop: space.s },
  count: { borderWidth: 1, borderRadius: shape.card, paddingHorizontal: space.l, paddingVertical: space.m },
});
