import { Text, View } from 'react-native';
import type { Ratings as Value, Signal } from '../core/ratings';
import { CheckIcon, WarnIcon } from './icons';
import { space, type, useTheme } from './theme';

const ICON = 18;

/** One rating: an icon that never carries the meaning alone, its name, its level in words, then the reasons. */
function Row({ title, label, good, bad, lines }: { title: string; label: string; good: boolean; bad: boolean; lines: string[] }) {
  const t = useTheme();
  const tint = bad ? t.attention : good ? t.primary : t.muted;
  return <View style={{ flexDirection: 'row', marginTop: space.s }}>
    <View style={{ width: ICON + space.s, alignItems: 'flex-start', paddingTop: (type.note.lineHeight - ICON) / 2 }}>
      {bad ? <WarnIcon size={ICON} color={tint} />
        : good ? <CheckIcon size={ICON} color={tint} />
        : <View style={{ width: 8, height: 8, borderRadius: 4, marginLeft: (ICON - 8) / 2, marginTop: (ICON - 8) / 2, backgroundColor: tint }} />}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[type.note, { color: t.muted }]}>
        {title} <Text style={{ color: bad ? t.attention : t.text, fontWeight: '600' }}>{label}</Text>
      </Text>
      {lines.map(line => <Text key={line} style={[type.note, { color: t.muted }]}>{line}</Text>)}
    </View>
  </View>;
}

const texts = (signals: Signal[]) => signals.slice(0, 2).map(s => s.text);
const sentence = (title: string, label: string, lines: string[]) => [`${title}: ${label}`, ...lines].join('. ') + '.';

/** A card's engagement rating and, apart from it, its stock-wording rating; read out as one label.
 *  No stock phrasing found stays neutral: it doesn't mean the draft sounds like you. */
export function Ratings({ ratings }: { ratings: Value | null }) {
  if (!ratings) return null;
  const { engagement: e, stock: s } = ratings;
  const engagementLines = [...texts(e.signals), e.unknown.join(' · ')];
  const stockLines = texts(s.signals);
  const label = `${sentence(e.title, e.label, [...texts(e.signals), ...e.unknown])} ${sentence(s.title, s.label, stockLines)}`;
  return <View accessible accessibilityLabel={label} style={{ marginTop: space.xs }}>
    <Row title={e.title} label={e.label} good={e.level === 'helps'} bad={e.level === 'hurts'} lines={engagementLines} />
    <Row title={s.title} label={s.label} good={false} bad={s.level !== 'none'} lines={stockLines} />
  </View>;
}
