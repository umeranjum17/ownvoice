import { Text, View } from 'react-native';
import type { Verdict } from '../core/judge';
import { type, useTheme } from './theme';

// The dot sits on the first line: a 22 dp column for it, so wrapped lines hang under the words.
const DOT_COLUMN = 22;

/** The line under a draft: hidden until a verdict comes, then a dot and one plain sentence. */
export function VerdictLine({ verdict }: { verdict: Verdict | null }) {
  const t = useTheme();
  if (!verdict) return null;
  return <View style={{ flexDirection: 'row', marginTop: 2 }}>
    <View style={{ width: DOT_COLUMN, paddingTop: (type.note.lineHeight - 8) / 2 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: verdict.good ? t.primary : t.attention }} />
    </View>
    <Text style={[type.note, { flex: 1, color: t.muted }]}>
      <Text style={[type.note, { color: t.text, fontWeight: '500' }]}>{verdict.lead}</Text>
      {verdict.rest}
    </Text>
  </View>;
}
