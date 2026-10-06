import { Text, View } from 'react-native';
import { POST_UNREAD, type Ratings as Value, type Signal } from '../core/ratings';
import type { Fit } from '../grow/fit';
import { WarnIcon } from './icons';
import { space, type, useTheme } from './theme';

const ICON = 18;

/** One rating: a warning or a neutral dot that never carries the meaning alone, its name, its level in words, then the reasons.
 *  Only Jev's fit level can rate a draft up, and even then there is no tick. */
function Row({ title, label, bad, lines }: { title: string; label: string; bad: boolean; lines: string[] }) {
  const t = useTheme();
  const tint = bad ? t.attention : t.muted;
  return <View style={{ flexDirection: 'row', marginTop: space.s }}>
    <View style={{ width: ICON + space.s, alignItems: 'flex-start', paddingTop: (type.note.lineHeight - ICON) / 2 }}>
      {bad ? <WarnIcon size={ICON} color={tint} />
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

const texts = (signals: Signal[]) => signals.map(s => s.text);
const sentence = (title: string, label: string, lines: string[]) => [`${title}: ${label}`, ...lines].join('. ') + '.';

/** A card's engagement rating and, apart from it, its stock-wording rating; read out as one label.
 *  With Jev's fit level the engagement rating is that level; without one it stays the text checks.
 *  In grow mode the fit bar below carries the level and the findings, so the panel hides this row
 *  there instead of showing two verdicts. A row appears only when it found something, and nothing
 *  appears when it found nothing. */
export function Ratings({ ratings, fit, hideEngagement }: { ratings: Value | null; fit?: Fit; hideEngagement?: boolean }) {
  if (!ratings) return null;
  const { engagement: e, stock: s } = ratings;
  const judged = fit?.level != null;
  const notes = texts(e.signals);
  const stockLines = texts(s.signals);
  // Nothing found means nothing shown: a row of "Nothing flagged" and "can't rate the fit" on every
  // card is noise, and it says nothing about the draft. A real level or a real finding earns the row.
  const discloses = e.unknown.includes(POST_UNREAD);
  if (hideEngagement && !stockLines.length) return null;
  if (!judged && !notes.length && !stockLines.length && !discloses) return null;
  const engagement = !hideEngagement && (notes.length || judged || discloses) ? sentence(e.title, judged ? fit.words : e.label, [...notes, ...e.unknown]) : '';
  const stock = stockLines.length ? sentence(s.title, s.label, stockLines) : '';
  const label = [engagement, stock].filter(Boolean).join(' ');
  return <View accessible accessibilityLabel={label} style={{ marginTop: space.xs }}>
    {engagement ? <Row title={e.title} label={judged ? fit.words : e.label} bad={judged ? fit.level === 0 : e.level === 'concerns'} lines={[...notes, ...e.unknown]} /> : null}
    {stock ? <Row title={s.title} label={s.label} bad={s.level !== 'none'} lines={stockLines} /> : null}
  </View>;
}
