import { Text, View } from 'react-native';
import { NEVER_SAY } from '../core/slop';
import type { Ratings } from '../core/ratings';
import { words } from '../core/words';
import { LEVELS, UNSURE, type Fit } from '../grow/fit';
import { space, type, useTheme } from './theme';

/** The engagement concern texts that force the bottom level, whatever the judge said. */
const LINK = 'Has a link';

/** A flagged card's reason, in the order the plan names them: never-say, link, too long. Tags of
 *  strangers and the other text checks stay in the card's rating rows; they never move the bar. */
export function fitFlag(ratings: Ratings | null): string | null {
  if (!ratings) return null;
  const never = ratings.stock.signals.find(signal => signal.text.includes(NEVER_SAY));
  if (never) return never.text;
  if (ratings.engagement.signals.some(signal => signal.concern && signal.text === LINK)) return LINK;
  return ratings.engagement.signals.find(signal => signal.concern && signal.text.startsWith('Too long for '))?.text ?? null;
}

const GLOSS = [words.fitWhySkipped, words.fitWhyVague, words.fitWhyGood, words.fitWhyStrong] as const;

/** Grow mode's fit bar: four segments and the level in words, with one reason line under it.
 *  The bar fills in when the fit lands (no fit yet, or still can't rate and nothing flagged:
 *  nothing shows). A rule flag always shows the bottom level and says why, even over a level.
 *  No number is ever shown or spoken: the spoken label is the level words alone. */
export function FitBar({ fit, ratings }: { fit: Fit | undefined; ratings: Ratings | null }) {
  const t = useTheme();
  if (!fit) return null;
  const flag = fitFlag(ratings);
  const level = flag ? 0 : fit.level;
  if (level == null && fit.words !== UNSURE && !flag) return null;
  const label = level != null ? LEVELS[level] : fit.words;
  const reason = flag ?? (level != null ? GLOSS[level] : words.fitWhyUnsure);
  const filled = level == null ? 0 : level + 1;
  return <View testID="fit-bar" style={{ marginTop: space.s }}>
    <View accessible accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {[0, 1, 2, 3].map(i => <View key={i} testID={`fit-segment-${i}`}
          style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < filled ? t.primary : t.line }} />)}
      </View>
      <Text style={[type.label, { color: t.text, marginTop: space.xs }]}>{label}</Text>
    </View>
    <Text style={[type.note, { color: t.muted }]}>{reason}</Text>
  </View>;
}
