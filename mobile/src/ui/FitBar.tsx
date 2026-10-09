import { Text, View } from 'react-native';
import { NEVER_SAY } from '../core/slop';
import { REACH_UNKNOWN, type Ratings } from '../core/ratings';
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

/** The engagement row's own findings, folded into the bar's reason so the card carries them once.
 *  The standing "Text alone can't predict reach" line stays in the other modes' rows only. */
function details(ratings: Ratings | null): string[] {
  if (!ratings) return [];
  return [
    ...ratings.engagement.signals.map(signal => signal.text),
    ...ratings.engagement.unknown.filter(line => line !== REACH_UNKNOWN),
  ];
}

const sentence = (parts: string[]) => parts.map(part => part.replace(/\.$/, '')).join('. ') + '.';

const GLOSS = [words.fitWhySkipped, words.fitWhyVague, words.fitWhyGood, words.fitWhyStrong] as const;

/** Whether the bar shows for this card: a judged or abstained fit, or a rule flag on its own. */
export function fitBarVisible(fit: Fit | undefined, ratings: Ratings | null): boolean {
  if (!fit) return false;
  if (fitFlag(ratings)) return true;
  return fit.level != null || fit.words === UNSURE;
}

/** Whether the bar carries a real verdict that replaces the engagement row: a rule flag or a level.
 *  A bare "Not sure" bar sits alongside the text checks instead of hiding them, so the person still
 *  sees what the text itself shows. The panel hides the engagement row exactly when this is true, so
 *  a card never shows two fit levels. */
export function fitHidesEngagement(fit: Fit | undefined, ratings: Ratings | null): boolean {
  if (!fit) return false;
  return !!fitFlag(ratings) || fit.level != null;
}

/** Grow mode's only fit display: four segments and the level in words, with one reason line under
 *  it. The bar fills in when the fit lands (no fit yet, or still plainly not sure and nothing flagged:
 *  nothing shows). A rule flag always shows the bottom level and says why, even over a level.
 *  No number is ever shown or spoken: the spoken label is the level words alone. */
export function FitBar({ fit, ratings }: { fit: Fit | undefined; ratings: Ratings | null }) {
  const t = useTheme();
  if (!fit || !fitBarVisible(fit, ratings)) return null;
  const flag = fitFlag(ratings);
  const level = flag ? 0 : fit.level;
  const label = level != null ? LEVELS[level] : fit.words;
  const found = details(ratings).filter(line => line !== flag);
  const reason = sentence(flag ? [flag, ...found] : [...found, level != null ? GLOSS[level] : words.fitWhyUnsure]);
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
