import { Text, View } from 'react-native';
import type { Check } from '../core/judge';
import { CheckIcon, WarnIcon } from './icons';
import { space, type, useTheme } from './theme';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A rewrite's meaning check: "Same meaning" with a tick, or "Check this: …" in amber. Hidden when unchecked. */
export function MeaningLine({ check }: { check: Check | null }) {
  const t = useTheme();
  if (!check) return null;
  const ok = check.ok;
  return <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.s }}>
    {ok
      ? <CheckIcon size={18} color={t.primary} />
      : <WarnIcon size={18} color={t.attention} />}
    <Text style={[type.note, { color: ok ? t.primary : t.attention, marginLeft: space.s, flexShrink: 1 }]}>
      {ok ? 'Same meaning' : `Check this: ${lowerFirst(check.reason)}`}
    </Text>
  </View>;
}
