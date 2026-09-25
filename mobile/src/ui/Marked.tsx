import { Text, type TextStyle } from 'react-native';
import type { Hit } from '../core/slop';
import { type, useTheme } from './theme';

/** [text] with each marked phrase softly highlighted. */
export function Marked({ text, hits, style }: { text: string; hits: Hit[]; style?: TextStyle }) {
  const t = useTheme();
  const parts: (string | { hit: Hit })[] = [];
  let at = 0;
  for (const hit of [...hits].sort((a, b) => a.start - b.start)) {
    if (hit.start < at) continue;
    if (hit.start > at) parts.push(text.slice(at, hit.start));
    parts.push({ hit });
    at = hit.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <Text style={[type.words, { color: t.text }, style]}>
    {parts.map((part, i) => typeof part === 'string'
      ? part
      : <Text key={i} style={{ backgroundColor: t.mark, color: t.onMark }}>{text.slice(part.hit.start, part.hit.end)}</Text>)}
  </Text>;
}
